import { describe, expect, it } from "vitest";
import { defineComponent } from "vue";

import { Container } from "@/infrastructure/di";

import { DashboardBlockToken } from "../tokens";

import { defineDashboardBlock } from "./schema";
import { SettingsUiService } from "./settings-ui-service";

import type { DashboardBlock } from "./schema";

const Stub = defineComponent({ render: () => null });

function block(key: string, order: number): DashboardBlock {
  return defineDashboardBlock({ key, component: Stub, order });
}

function build(options: { blocks?: readonly DashboardBlock[] } = {}): SettingsUiService {
  const c = new Container();
  for (const b of options.blocks ?? []) c.register(DashboardBlockToken).useValue(b);
  // SubpageToken stays empty here; multi-tokens resolve to [] after Task 1.
  c.register(SettingsUiService).useClass(SettingsUiService);
  return c.resolve(SettingsUiService);
}

describe("SettingsUiService", () => {
  describe("construction", () => {
    it("exposes blocks sorted by order regardless of binding order", () => {
      const a = block("a", 30);
      const b = block("b", 10);
      const c = block("c", 20);

      const service = build({ blocks: [a, b, c] });

      expect(service.blocks.map((entry) => entry.key)).toEqual(["b", "c", "a"]);
    });
  });
});
