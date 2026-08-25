import { describe, expect, it } from "vitest";

import { Flows, UserAborted } from "@/infrastructure/flows";
import { journalsCoreModule } from "@/journals/module";
import { shelvesCoreModule } from "@/shelves/module";
import { testContainer } from "@/testing";

import { viewsCoreModule } from "../module";
import { ViewsRepository } from "../repository";
import { buildView } from "../testing";

import { DeleteViewFlow } from "./delete-view.flow";

import type { ViewId } from "../config";

const VIEW_A = "11111111-1111-4111-8111-111111111111" as ViewId;

async function build() {
  const harness = await testContainer({
    modules: [journalsCoreModule, shelvesCoreModule, viewsCoreModule],
    data: { views: { [VIEW_A]: buildView(VIEW_A) } },
  });
  return { repo: harness.resolve(ViewsRepository), modals: harness.modals, flows: harness.resolve(Flows) };
}

describe("DeleteViewFlow", () => {
  it("deletes the view on submit", async () => {
    const { flows, modals, repo } = await build();
    const promise = flows.invoke(DeleteViewFlow, { viewId: VIEW_A });
    modals.lastOpen<unknown, void>().submit(undefined);
    await promise;
    expect(repo.get(VIEW_A).isNone()).toBe(true);
  });

  it("returns UserAborted when the modal is cancelled", async () => {
    const { flows, modals, repo } = await build();
    const promise = flows.invoke(DeleteViewFlow, { viewId: VIEW_A });
    modals.lastOpen().cancel();
    const result = await promise;
    expect(result.kind === "err" && result.error).toBeInstanceOf(UserAborted);
    expect(repo.get(VIEW_A).isSome()).toBe(true);
  });
});
