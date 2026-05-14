import { describe, expect, it } from "vitest";
import { defineComponent } from "vue";

import { Container } from "@/infrastructure/di";

import { DuplicateBlockKeyError, DuplicateSubpageKeyError, UnregisteredSubpageError } from "../errors";
import { DashboardBlockToken, SubpageToken } from "../tokens";

import { defineDashboardBlock, defineSubpage } from "./schema";
import { SettingsUiService } from "./settings-ui-service";

import type { DashboardBlock, Subpage } from "./schema";

const Stub = defineComponent({ render: () => null });

function block(key: string, order: number): DashboardBlock {
  return defineDashboardBlock({ key, component: Stub, order });
}

function subpage(key: string): Subpage<void> {
  return defineSubpage({ key, component: Stub });
}

function build(
  options: {
    blocks?: readonly DashboardBlock[];
    subpages?: readonly Subpage<unknown>[];
  } = {},
): SettingsUiService {
  const c = new Container();
  for (const b of options.blocks ?? []) c.register(DashboardBlockToken).useValue(b);
  for (const s of options.subpages ?? []) c.register(SubpageToken).useValue(s);
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

    it("throws DuplicateBlockKeyError when two blocks share a key", () => {
      const a = block("dup", 10);
      const b = block("dup", 20);
      expect(() => build({ blocks: [a, b] })).toThrow(DuplicateBlockKeyError);
    });

    it("throws DuplicateSubpageKeyError when two subpages share a key", () => {
      const a = subpage("dup");
      const b = subpage("dup");
      expect(() => build({ subpages: [a, b] })).toThrow(DuplicateSubpageKeyError);
    });
  });

  describe("push", () => {
    it("advances current to the new frame", () => {
      const edit = subpage("journal-edit");
      const service = build({ subpages: [edit] });

      expect(service.current.value).toBeNull();
      service.push(edit, undefined);
      expect(service.current.value).toEqual({ subpage: edit, props: undefined });
    });

    it("throws UnregisteredSubpageError when the subpage was never bound", () => {
      const stray = subpage("stray");
      const service = build({ subpages: [] });

      expect(() => service.push(stray, undefined)).toThrow(UnregisteredSubpageError);
    });
  });
});
