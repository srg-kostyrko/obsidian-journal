import { afterEach, describe, expect, it, vi } from "vitest";

import { Container } from "@/infrastructure/di";
import { createFakeHost } from "@/infrastructure/host/internal/testing";
import { gateViolations, type GateViolation } from "@/settings/repair/schema-walk";
import type { AnyNestedCollectionDefinition } from "@/settings/schema";
import { CollectionDefinitionToken, SliceDefinitionToken } from "@/settings/tokens";
import { ToolbarItemDefinitionToken, ViewBlockDefinitionToken } from "@/views/tokens";

import JournalPlugin from "./main";

import type { PluginManifest } from "obsidian";

const MANIFEST = { id: "journal", name: "Journal", author: "test", version: "3.0.0" } as unknown as PluginManifest;

// main.ts builds its container internally, so the registered definitions are reachable only by
// catching that container on its way through `autoLoad()`.
async function bootedContainer(): Promise<Container> {
  const autoLoad = vi.spyOn(Container.prototype, "autoLoad");
  await new JournalPlugin(createFakeHost().app, MANIFEST).onload();
  const captured = autoLoad.mock.contexts.at(0);
  if (!(captured instanceof Container)) throw new TypeError("JournalPlugin never reached autoLoad");
  return captured;
}

function allViolations(container: Container): GateViolation[] {
  const out: GateViolation[] = [];
  for (const slice of container.resolve(SliceDefinitionToken)) {
    out.push(...gateViolations(`slice ${slice.key}`, slice.schema));
  }
  for (const collection of container.resolve(CollectionDefinitionToken)) {
    const nested: [string, AnyNestedCollectionDefinition | undefined][] = Object.entries(collection.nested ?? {});
    out.push(
      ...gateViolations(`collection ${collection.key}`, collection.itemSchema, {
        skipKeys: nested.map(([key]) => key),
      }),
    );
    for (const [key, definition] of nested) {
      if (definition !== undefined) {
        out.push(...gateViolations(`collection ${collection.key}.${key}`, definition.itemSchema));
      }
    }
  }
  for (const block of container.resolve(ViewBlockDefinitionToken)) {
    out.push(...gateViolations(`view block ${block.key}`, block.schema));
  }
  for (const item of container.resolve(ToolbarItemDefinitionToken)) {
    out.push(...gateViolations(`toolbar item ${item.key}`, item.schema));
  }
  return out;
}

describe("settings schema gate", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("gives every stored field below the top level a default or a repair marker", async () => {
    const container = await bootedContainer();

    const violations = allViolations(container);

    const listing = violations.map(({ root, path, reason }) => `${root}: ${path} (${reason})`).join("\n");
    expect(violations, `\n${listing}\n`).toEqual([]);
  });
});
