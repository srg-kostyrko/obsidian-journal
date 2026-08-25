import { describe, expect, it } from "vitest";

import { m } from "@/i18n";
import { Flows, UserAborted } from "@/infrastructure/flows";
import type { FakeHost } from "@/infrastructure/host/internal/testing";
import { journalsCoreModule } from "@/journals/module";
import { shelvesCoreModule } from "@/shelves/module";
import { testContainer } from "@/testing";

import { viewsCoreModule } from "../module";
import { viewsStartupModule } from "../startup-module";
import { buildView } from "../testing";

import { RepositionViewFlow } from "./reposition-view.flow";

import type { ViewId } from "../config";

const VIEW_A = "11111111-1111-4111-8111-111111111111" as ViewId;

async function build() {
  const harness = await testContainer({
    modules: [journalsCoreModule, shelvesCoreModule, viewsCoreModule, viewsStartupModule],
    data: { views: { [VIEW_A]: buildView(VIEW_A, { leaf: "tab" }) } },
    allow: { hostState: true },
  });
  return { host: harness.host, modals: harness.modals, flows: harness.resolve(Flows) };
}

async function seedOpenLeaf(host: FakeHost, id: ViewId): Promise<void> {
  await host.app.workspace.getRightLeaf(false)!.setViewState({ type: `journal-view:${id}` });
}

describe("RepositionViewFlow", () => {
  it("repositions the open view on submit", async () => {
    const { host, flows, modals } = await build();
    await seedOpenLeaf(host, VIEW_A);
    const promise = flows.invoke(RepositionViewFlow, { viewId: VIEW_A });
    modals.lastOpen<{ location: string }, void>().submit(undefined);
    await promise;
    expect(host.workspace.detachedTypes).toContain(`journal-view:${VIEW_A}`);
  });

  it("describes the target open mode in the modal", async () => {
    const { host, flows, modals } = await build();
    await seedOpenLeaf(host, VIEW_A);
    void flows.invoke(RepositionViewFlow, { viewId: VIEW_A });
    expect(modals.lastOpen<{ location: string }, void>().props.location).toBe(m.view_edit_leaf_tab());
  });

  it("returns UserAborted and leaves the view in place when cancelled", async () => {
    const { host, flows, modals } = await build();
    await seedOpenLeaf(host, VIEW_A);
    const promise = flows.invoke(RepositionViewFlow, { viewId: VIEW_A });
    modals.lastOpen().cancel();
    const result = await promise;
    expect(result.kind === "err" && result.error).toBeInstanceOf(UserAborted);
    expect(host.workspace.detachedTypes).toEqual([]);
  });

  it("does not open a modal when the view is closed", async () => {
    const { flows, modals } = await build();
    const result = await flows.invoke(RepositionViewFlow, { viewId: VIEW_A });
    expect(modals.opens.length).toBe(0);
    expect(result.kind).toBe("ok");
  });
});
