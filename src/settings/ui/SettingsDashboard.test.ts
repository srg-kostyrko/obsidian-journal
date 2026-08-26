import { screen } from "@testing-library/vue";
import { describe, expect, it } from "vitest";
import { defineComponent, h, nextTick } from "vue";

import { m } from "@/i18n";
import type { Module } from "@/infrastructure/di";
import { testContainer } from "@/testing";

import { ReloadHintService } from "../reload-hint";
import { DashboardBlockToken, SubpageToken } from "../tokens";

import { defineDashboardBlock, defineSubpage } from "./schema";
import { SettingsUiService } from "./settings-ui-service";
import SettingsDashboard from "./SettingsDashboard.vue";

import type { DashboardBlock, Subpage } from "./schema";

function blockComponent(label: string) {
  return defineComponent({ render: () => h("div", { "data-testid": `block-${label}` }, label) });
}

function block(key: string, order: number, label = key): DashboardBlock {
  return defineDashboardBlock({ key, component: blockComponent(label), order });
}

function testUiModule(
  options: {
    blocks?: readonly DashboardBlock[];
    subpages?: readonly Subpage<unknown>[];
  } = {},
): Module {
  return {
    register(c) {
      const blocks = options.blocks ?? [];
      for (const b of blocks) c.register(DashboardBlockToken).useValue(b);
      const subpages = options.subpages ?? [];
      for (const s of subpages) c.register(SubpageToken).useValue(s);
    },
  };
}

async function buildHarness(
  options: {
    blocks?: readonly DashboardBlock[];
    subpages?: readonly Subpage<unknown>[];
  } = {},
) {
  const harness = await testContainer({ modules: [testUiModule(options)] });
  return {
    harness,
    service: harness.resolve(SettingsUiService),
    reloadHint: harness.resolve(ReloadHintService),
  };
}

describe("SettingsDashboard", () => {
  describe("dashboard view", () => {
    it("renders blocks in order", async () => {
      const { harness } = await buildHarness({
        blocks: [block("c", 30, "third"), block("a", 10, "first"), block("b", 20, "second")],
      });

      harness.render(SettingsDashboard);

      const labels = screen.getAllByTestId(/^block-/).map((node) => node.textContent);
      expect(labels).toEqual(["first", "second", "third"]);
    });
  });

  describe("scroll position", () => {
    const sub = defineSubpage({ key: "edit", component: blockComponent("subpage") });

    async function renderScrolled(scrollTop: number) {
      const { harness, service } = await buildHarness({ subpages: [sub] });
      const { container } = harness.render(SettingsDashboard);
      // Vue mounts into the settings pane, so the rendered root's parent stands in for it.
      const scroller = container.firstElementChild!.parentElement!;
      scroller.scrollTop = scrollTop;
      return { service, scroller };
    }

    it("opens a subpage at its top rather than mid-scroll", async () => {
      const { service, scroller } = await renderScrolled(420);
      service.push(sub, undefined);
      await nextTick();
      await nextTick();
      expect(scroller.scrollTop).toBe(0);
    });

    it("returns the dashboard to where the user left it", async () => {
      const { service, scroller } = await renderScrolled(420);
      service.push(sub, undefined);
      await nextTick();
      await nextTick();
      // The user scrolls the subpage before going back, so the offset has to be restored
      // rather than merely left alone.
      scroller.scrollTop = 80;
      service.pop();
      await nextTick();
      await nextTick();
      expect(scroller.scrollTop).toBe(420);
    });
  });

  describe("reload banner", () => {
    it("stays hidden until a reload-requiring change is made", async () => {
      const { harness } = await buildHarness();
      harness.render(SettingsDashboard);
      expect(screen.queryByText(m.settings_reload_required_banner())).toBeNull();
    });

    it("appears once a reload is requested", async () => {
      const { harness, reloadHint } = await buildHarness();
      harness.render(SettingsDashboard);
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

      const { harness, service } = await buildHarness({
        blocks: [dashboardBlock],
        subpages: [editSubpage],
      });

      harness.render(SettingsDashboard);
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

      const { harness, service } = await buildHarness({
        subpages: [firstSub, secondSub],
      });

      harness.render(SettingsDashboard);
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
