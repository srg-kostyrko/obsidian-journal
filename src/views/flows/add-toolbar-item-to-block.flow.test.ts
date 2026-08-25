import { describe, expect, it, vi } from "vitest";

import { Flows, UserAborted } from "@/infrastructure/flows";
import { journalsCoreModule } from "@/journals/module";
import { shelvesCoreModule } from "@/shelves/module";
import { testContainer } from "@/testing";

import { UnknownToolbarItemKeyError } from "../errors";
import { viewsCoreModule } from "../module";
import { ViewsRepository } from "../repository";
import { buildView } from "../testing";

import { AddToolbarItemToBlockFlow } from "./add-toolbar-item-to-block.flow";

import type { BlockInstanceId, View, ViewId } from "../config";

const VIEW_A = "11111111-1111-4111-8111-111111111111" as ViewId;
const BLOCK_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" as BlockInstanceId;

function readItems(repo: ViewsRepository): { id: string; key: string; config: unknown }[] {
  const rawConfig =
    repo
      .get(VIEW_A)
      .getOr(undefined as never)
      ?.blocks.find((b) => b.id === BLOCK_A)?.config ?? {};
  return Array.isArray(rawConfig.items) ? (rawConfig.items as { id: string; key: string; config: unknown }[]) : [];
}

async function build() {
  const seeds: Record<string, View> = {
    [VIEW_A]: buildView(VIEW_A, { blocks: [{ id: BLOCK_A, key: "toolbar", config: { items: [] } }] }),
  };
  const harness = await testContainer({
    modules: [journalsCoreModule, shelvesCoreModule, viewsCoreModule],
    data: { views: seeds },
  });
  return { repo: harness.resolve(ViewsRepository), modals: harness.modals, flows: harness.resolve(Flows) };
}

describe("AddToolbarItemToBlockFlow", () => {
  it("opens the picker modal then adds the chosen item to the block", async () => {
    const { flows, modals, repo } = await build();
    const promise = flows.invoke(AddToolbarItemToBlockFlow, { viewId: VIEW_A, blockId: BLOCK_A });
    modals
      .lastOpen<unknown, { key: string; defaultConfig: unknown }>()
      .submit({ key: "shelf-selector", defaultConfig: {} });
    await promise;
    const rawConfig =
      repo
        .get(VIEW_A)
        .getOr(undefined as never)
        ?.blocks.find((b) => b.id === BLOCK_A)?.config ?? {};
    const items = Array.isArray(rawConfig.items) ? (rawConfig.items as { key: string }[]) : [];
    expect(items.map((i) => i.key)).toEqual(["shelf-selector"]);
  });

  it("aborts with UserAborted when the picker is cancelled", async () => {
    const { flows, modals } = await build();
    const promise = flows.invoke(AddToolbarItemToBlockFlow, { viewId: VIEW_A, blockId: BLOCK_A });
    modals.lastOpen().cancel();
    const result = await promise;
    expect(result.kind === "err" && result.error).toBeInstanceOf(UserAborted);
  });

  it("surfaces UnknownToolbarItemKeyError as a flow error when the chosen key is unregistered", async () => {
    const { flows, modals } = await build();
    const promise = flows.invoke(AddToolbarItemToBlockFlow, { viewId: VIEW_A, blockId: BLOCK_A });
    modals
      .lastOpen<unknown, { key: string; defaultConfig: unknown }>()
      .submit({ key: "unknown-item", defaultConfig: {} });
    const result = await promise;
    expect(result.kind === "err" && result.error.cause).toBeInstanceOf(UnknownToolbarItemKeyError);
  });

  it("opens the config modal after adding a configurable item and applies the submitted config", async () => {
    const { flows, modals, repo } = await build();
    const promise = flows.invoke(AddToolbarItemToBlockFlow, { viewId: VIEW_A, blockId: BLOCK_A });
    modals
      .lastOpen<unknown, { key: string; defaultConfig: unknown }>()
      .submit({ key: "period-buttons", defaultConfig: { week: false, month: true, quarter: true, year: true } });
    await vi.waitFor(() => expect(modals.opens).toHaveLength(2));
    modals.lastOpen<unknown, Record<string, unknown>>().submit({ week: true, month: true, quarter: true, year: true });
    await promise;
    expect(readItems(repo)).toEqual([
      expect.objectContaining({
        key: "period-buttons",
        config: { week: true, month: true, quarter: true, year: true },
      }),
    ]);
  });

  it("adds a non-configurable item without opening a config modal", async () => {
    const { flows, modals } = await build();
    const promise = flows.invoke(AddToolbarItemToBlockFlow, { viewId: VIEW_A, blockId: BLOCK_A });
    modals
      .lastOpen<unknown, { key: string; defaultConfig: unknown }>()
      .submit({ key: "shelf-selector", defaultConfig: {} });
    await promise;
    expect(modals.opens).toHaveLength(1);
  });

  it("keeps the added item with its default config when the config modal is cancelled", async () => {
    const { flows, modals, repo } = await build();
    const promise = flows.invoke(AddToolbarItemToBlockFlow, { viewId: VIEW_A, blockId: BLOCK_A });
    modals
      .lastOpen<unknown, { key: string; defaultConfig: unknown }>()
      .submit({ key: "period-buttons", defaultConfig: { week: false, month: true, quarter: true, year: true } });
    await vi.waitFor(() => expect(modals.opens).toHaveLength(2));
    modals.lastOpen().cancel();
    const result = await promise;
    expect(result.kind).toBe("ok");
    expect(readItems(repo)).toEqual([
      expect.objectContaining({
        key: "period-buttons",
        config: { week: false, month: true, quarter: true, year: true },
      }),
    ]);
  });
});
