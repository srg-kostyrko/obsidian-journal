import { describe, expect, it } from "vitest";

import { Flows, UserAborted } from "@/infrastructure/flows";
import { journalsCoreModule } from "@/journals/module";
import { shelvesCoreModule } from "@/shelves/module";
import { testContainer } from "@/testing";

import { viewsCoreModule } from "../module";
import { ViewsRepository } from "../repository";
import { buildView } from "../testing";

import { EditViewNameFlow } from "./edit-view-name.flow";

import type { View, ViewId } from "../config";
import type { ViewNameModalResult } from "../ui/modals";

const VIEW_A = "11111111-1111-4111-8111-111111111111" as ViewId;

async function build(seeds: Record<string, View> = {}) {
  const harness = await testContainer({
    modules: [journalsCoreModule, shelvesCoreModule, viewsCoreModule],
    data: { views: seeds },
  });
  return { repo: harness.resolve(ViewsRepository), modals: harness.modals, flows: harness.resolve(Flows) };
}

describe("EditViewNameFlow", () => {
  it("creates a new view with the entered name", async () => {
    const { flows, modals, repo } = await build();
    const promise = flows.invoke(EditViewNameFlow, {});
    modals.lastOpen<unknown, ViewNameModalResult>().submit({ name: "Weekly", icon: "calendar-days" });
    const result = await promise;
    expect(result.kind).toBe("ok");
    expect(
      repo
        .find()
        .filter((v) => v.name === "Weekly")
        .first()
        .isSome(),
    ).toBe(true);
  });

  it("creates a new view with the chosen icon", async () => {
    const { flows, modals, repo } = await build();
    const promise = flows.invoke(EditViewNameFlow, {});
    modals.lastOpen<unknown, ViewNameModalResult>().submit({ name: "Weekly", icon: "calendar-days" });
    await promise;
    expect(
      repo
        .find()
        .filter((v) => v.name === "Weekly")
        .first()
        .map((v) => v.icon)
        .getOrUndefined(),
    ).toBe("calendar-days");
  });

  it("renames an existing view", async () => {
    const { flows, modals, repo } = await build({ [VIEW_A]: buildView(VIEW_A, { name: "Old" }) });
    const promise = flows.invoke(EditViewNameFlow, { viewId: VIEW_A });
    modals.lastOpen<unknown, ViewNameModalResult>().submit({ name: "New", icon: "" });
    await promise;
    expect(repo.get(VIEW_A).getOrUndefined()?.name).toBe("New");
  });

  it("keeps the existing icon when renaming", async () => {
    const { flows, modals, repo } = await build({
      [VIEW_A]: buildView(VIEW_A, { name: "Old", icon: "calendar-days" }),
    });
    const promise = flows.invoke(EditViewNameFlow, { viewId: VIEW_A });
    modals.lastOpen<unknown, ViewNameModalResult>().submit({ name: "New", icon: "" });
    await promise;
    expect(repo.get(VIEW_A).getOrUndefined()?.icon).toBe("calendar-days");
  });

  it("returns UserAborted when the modal is cancelled", async () => {
    const { flows, modals } = await build();
    const promise = flows.invoke(EditViewNameFlow, {});
    modals.lastOpen().cancel();
    const result = await promise;
    expect(result.kind === "err" && result.error).toBeInstanceOf(UserAborted);
  });
});
