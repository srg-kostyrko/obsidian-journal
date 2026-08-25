import { describe, expect, it, vi } from "vitest";

import { Flows, UserAborted } from "@/infrastructure/flows";
import { journalsCoreModule } from "@/journals/module";
import { shelvesCoreModule } from "@/shelves/module";
import { testContainer } from "@/testing";

import { viewsCoreModule } from "../module";
import { ViewsRepository } from "../repository";
import { buildView } from "../testing";

import { AddBlockToViewFlow } from "./add-block-to-view.flow";

import type { ViewId } from "../config";

const VIEW_A = "11111111-1111-4111-8111-111111111111" as ViewId;

function readBlocks(repo: ViewsRepository): { key: string; config: unknown }[] {
  return (
    repo
      .get(VIEW_A)
      .getOr(undefined as never)
      ?.blocks.map((b) => ({ key: b.key, config: b.config })) ?? []
  );
}

async function build() {
  const harness = await testContainer({
    modules: [journalsCoreModule, shelvesCoreModule, viewsCoreModule],
    data: { views: { [VIEW_A]: buildView(VIEW_A) } },
  });
  return { repo: harness.resolve(ViewsRepository), modals: harness.modals, flows: harness.resolve(Flows) };
}

describe("AddBlockToViewFlow", () => {
  it("appends the chosen block to the view", async () => {
    const { flows, modals, repo } = await build();
    const promise = flows.invoke(AddBlockToViewFlow, { viewId: VIEW_A });
    modals.lastOpen<unknown, string>().submit("divider");
    await promise;
    expect(
      repo
        .get(VIEW_A)
        .getOr(undefined as never)
        ?.blocks.map((b) => b.key),
    ).toEqual(["divider"]);
  });

  it("returns UserAborted when the modal is cancelled", async () => {
    const { flows, modals } = await build();
    const promise = flows.invoke(AddBlockToViewFlow, { viewId: VIEW_A });
    modals.lastOpen().cancel();
    const result = await promise;
    expect(result.kind === "err" && result.error).toBeInstanceOf(UserAborted);
  });

  it("opens the config modal after adding a configurable block and applies the submitted config", async () => {
    const { flows, modals, repo } = await build();
    const promise = flows.invoke(AddBlockToViewFlow, { viewId: VIEW_A });
    modals.lastOpen<unknown, string>().submit("markdown-template");
    await vi.waitFor(() => expect(modals.opens).toHaveLength(2));
    modals.lastOpen<unknown, Record<string, unknown>>().submit({ templatePath: "journal-template.md" });
    await promise;
    expect(readBlocks(repo)).toEqual([{ key: "markdown-template", config: { templatePath: "journal-template.md" } }]);
  });

  it("adds a block without a config component without opening a config modal", async () => {
    const { flows, modals } = await build();
    const promise = flows.invoke(AddBlockToViewFlow, { viewId: VIEW_A });
    modals.lastOpen<unknown, string>().submit("divider");
    await promise;
    expect(modals.opens).toHaveLength(1);
  });

  it("keeps the added block with its default config when the config modal is cancelled", async () => {
    const { flows, modals, repo } = await build();
    const promise = flows.invoke(AddBlockToViewFlow, { viewId: VIEW_A });
    modals.lastOpen<unknown, string>().submit("markdown-template");
    await vi.waitFor(() => expect(modals.opens).toHaveLength(2));
    modals.lastOpen().cancel();
    const result = await promise;
    expect(result.kind).toBe("ok");
    expect(readBlocks(repo)).toEqual([{ key: "markdown-template", config: { templatePath: "" } }]);
  });
});
