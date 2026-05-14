import { cleanup, render, screen } from "@testing-library/vue";
import { afterEach, describe, expect, it } from "vitest";
import { defineComponent, h } from "vue";

import { Container, InjectorToken, provideInjector } from "@/infrastructure/di";

import { DashboardBlockToken, SubpageToken } from "../tokens";

import { defineDashboardBlock } from "./schema";
import { SettingsUiService } from "./settings-ui-service";
import Shell from "./Shell.vue";

import type { DashboardBlock, Subpage } from "./schema";

afterEach(() => cleanup());

function blockComponent(label: string) {
  return defineComponent({ render: () => h("div", { "data-testid": `block-${label}` }, label) });
}

function block(key: string, order: number, label = key): DashboardBlock {
  return defineDashboardBlock({ key, component: blockComponent(label), order });
}

function renderShell() {
  return h(Shell);
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
      return renderShell;
    },
  });
  return { Harness, service };
}

describe("Shell", () => {
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
});
