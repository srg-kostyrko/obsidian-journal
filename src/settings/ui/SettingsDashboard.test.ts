import { cleanup, render, screen } from "@testing-library/vue";
import { afterEach, describe, expect, it } from "vitest";
import { defineComponent, h, nextTick } from "vue";

import { m } from "@/i18n";
import { Container, InjectorToken, provideInjector } from "@/infrastructure/di";

import { ReloadHintService } from "../reload-hint";
import { DashboardBlockToken, SubpageToken } from "../tokens";

import { defineDashboardBlock, defineSubpage } from "./schema";
import { SettingsUiService } from "./settings-ui-service";
import SettingsDashboard from "./SettingsDashboard.vue";

import type { DashboardBlock, Subpage } from "./schema";

afterEach(() => cleanup());

function blockComponent(label: string) {
  return defineComponent({ render: () => h("div", { "data-testid": `block-${label}` }, label) });
}

function block(key: string, order: number, label = key): DashboardBlock {
  return defineDashboardBlock({ key, component: blockComponent(label), order });
}

function renderDashboard() {
  return h(SettingsDashboard);
}

function buildHarness(
  options: {
    blocks?: readonly DashboardBlock[];
    subpages?: readonly Subpage<unknown>[];
  } = {},
) {
  const c = new Container();
  const blocks = options.blocks ?? [];
  for (const b of blocks) c.register(DashboardBlockToken).useValue(b);
  const subpages = options.subpages ?? [];
  for (const s of subpages) c.register(SubpageToken).useValue(s);
  c.register(SettingsUiService).useClass(SettingsUiService);
  c.register(ReloadHintService).useClass(ReloadHintService);
  const injector = c.resolve(InjectorToken);
  const service = c.resolve(SettingsUiService);
  const reloadHint = c.resolve(ReloadHintService);
  const Harness = defineComponent({
    setup() {
      provideInjector(injector);
      return renderDashboard;
    },
  });
  return { Harness, service, reloadHint };
}

describe("SettingsDashboard", () => {
  describe("dashboard view", () => {
    it("renders blocks in order", () => {
      const { Harness } = buildHarness({
        blocks: [block("c", 30, "third"), block("a", 10, "first"), block("b", 20, "second")],
      });

      render(Harness);

      const labels = screen.getAllByTestId(/^block-/).map((node) => node.textContent);
      expect(labels).toEqual(["first", "second", "third"]);
    });
  });

  describe("reload banner", () => {
    it("stays hidden until a reload-requiring change is made", () => {
      const { Harness } = buildHarness();
      render(Harness);
      expect(screen.queryByText(m.settings_reload_required_banner())).toBeNull();
    });

    it("appears once a reload is requested", async () => {
      const { Harness, reloadHint } = buildHarness();
      render(Harness);
      reloadHint.request();
      await nextTick();
      expect(screen.getByText(m.settings_reload_required_banner())).toBeTruthy();
    });
  });

  describe("subpage routing", () => {
    it("mounts the active subpage with its props and hides the dashboard", async () => {
      const EditPage = defineComponent({
        props: { name: { type: String, required: true } },
        render() {
          return h("div", { "data-testid": "edit-page" }, `editing ${this.name}`);
        },
      });
      const editSubpage = defineSubpage<{ name: string }>({ key: "edit", component: EditPage });
      const dashboardBlock = block("only", 0, "dashboard-tile");

      const { Harness, service } = buildHarness({
        blocks: [dashboardBlock],
        subpages: [editSubpage],
      });

      render(Harness);
      service.push(editSubpage, { name: "Daily" });
      await Promise.resolve(); // let Vue flush

      expect(screen.queryByTestId("block-dashboard-tile")).toBeNull();
      expect(screen.getByTestId("edit-page").textContent).toBe("editing Daily");
    });

    it("invoking nav.back returns to the previous frame", async () => {
      const back = { current: null as null | (() => void) };
      const First = defineComponent({
        props: { nav: { type: Object, required: true } },
        render() {
          back.current = (this.nav as { back: () => void }).back;
          return h("div", { "data-testid": "first" }, "first");
        },
      });
      const Second = defineComponent({
        props: { nav: { type: Object, required: true } },
        render() {
          back.current = (this.nav as { back: () => void }).back;
          return h("div", { "data-testid": "second" }, "second");
        },
      });
      const firstSub = defineSubpage({ key: "first", component: First });
      const secondSub = defineSubpage({ key: "second", component: Second });

      const { Harness, service } = buildHarness({
        subpages: [firstSub, secondSub],
      });

      render(Harness);
      service.push(firstSub, undefined);
      await Promise.resolve();
      const _afterFirst = service.current.value;
      service.push(secondSub, undefined);
      await Promise.resolve();
      expect(screen.getByTestId("second")).toBeTruthy();

      back.current?.();
      await Promise.resolve();

      expect(screen.queryByTestId("second")).toBeNull();
      expect(screen.getByTestId("first")).toBeTruthy();
    });
  });
});
