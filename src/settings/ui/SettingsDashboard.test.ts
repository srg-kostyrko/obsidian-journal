import { cleanup, render, screen } from "@testing-library/vue";
import { afterEach, describe, expect, it } from "vitest";
import { defineComponent, h } from "vue";

import { Container, InjectorToken, provideInjector } from "@/infrastructure/di";

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
  for (const b of options.blocks ?? []) c.register(DashboardBlockToken).useValue(b);
  for (const s of options.subpages ?? []) c.register(SubpageToken).useValue(s);
  c.register(SettingsUiService).useClass(SettingsUiService);
  const injector = c.resolve(InjectorToken);
  const service = c.resolve(SettingsUiService);
  const Harness = defineComponent({
    setup() {
      provideInjector(injector);
      return renderDashboard;
    },
  });
  return { Harness, service };
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
