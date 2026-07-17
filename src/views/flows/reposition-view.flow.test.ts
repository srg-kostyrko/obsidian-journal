import { createNanoEvents } from "nanoevents";
import { describe, expect, it } from "vitest";

import { m } from "@/i18n";
import { Container } from "@/infrastructure/di";
import { Flows, UserAborted } from "@/infrastructure/flows";
import { NoticeService } from "@/infrastructure/host";
import { CommandService } from "@/infrastructure/host/commands";
import { createFakeHost } from "@/infrastructure/host/internal/testing";
import { InternalObsidianAppToken, InternalPluginToken } from "@/infrastructure/host/internal/tokens";
import { ModalService } from "@/infrastructure/host/modals";
import { FakeModalService } from "@/infrastructure/host/modals/testing";
import { SuggestService } from "@/infrastructure/host/suggests";
import { FakeSuggestService } from "@/infrastructure/host/suggests/testing";
import { FakeNoticeService } from "@/infrastructure/host/testing";
import { createLoggerTestingModule } from "@/infrastructure/logger/testing";
import { ShelvesRepository } from "@/shelves";
import { fakeShelvesRepo } from "@/shelves/testing";

import { ViewsRepository } from "../repository";
import { ViewsEventsToken, type ViewsEvents } from "../tokens";
import { ViewHostService } from "../view-host";
import { ViewsViewModel } from "../view-model";

import { RepositionViewFlow } from "./reposition-view.flow";

import type { View, ViewId } from "../config";

function seedView(id: string, overrides: Partial<View> = {}): View {
  return {
    id: id as ViewId,
    name: "View " + id,
    icon: "calendar-days",
    defaultShelf: null,
    showInRibbon: false,
    leaf: "right",
    openOnStartup: false,
    rememberDate: false,
    blocks: [],
    ...overrides,
  };
}

function build(seeds: Record<string, View> = {}) {
  const host = createFakeHost();
  const storage: Record<string, View> = { ...seeds };
  const events = createNanoEvents<ViewsEvents>();
  const repo = ViewsRepository.fromParts(storage, events);
  const c = new Container();
  c.register(InternalPluginToken).useValue(host.plugin);
  c.register(InternalObsidianAppToken).useValue(host.app);
  c.addModule(createLoggerTestingModule().module);
  c.register(CommandService).useClass(CommandService);
  c.register(ViewsRepository).useValue(repo);
  c.register(ViewsEventsToken).useValue(events);
  c.register(ShelvesRepository).useValue(fakeShelvesRepo());
  c.register(SuggestService).useValue(new FakeSuggestService() as unknown as SuggestService);
  c.register(ViewHostService).useClass(ViewHostService);
  c.register(ViewsViewModel).useClass(ViewsViewModel);
  const modals = new FakeModalService();
  c.register(ModalService).useValue(modals as unknown as ModalService);
  c.register(NoticeService).useValue(new FakeNoticeService());
  c.register(Flows).useClass(Flows);
  c.register(RepositionViewFlow).useClass(RepositionViewFlow);
  c.resolve(ViewHostService);
  return { host, modals, flows: c.resolve(Flows) };
}

async function seedOpenLeaf(host: ReturnType<typeof createFakeHost>, id: string): Promise<void> {
  await host.app.workspace.getRightLeaf(false)!.setViewState({ type: `journal-view:${id}` });
}

describe("RepositionViewFlow", () => {
  it("repositions the open view on submit", async () => {
    const { host, flows, modals } = build({ a: seedView("a", { leaf: "tab" }) });
    await seedOpenLeaf(host, "a");
    const promise = flows.invoke(RepositionViewFlow, { viewId: "a" as ViewId });
    modals.lastOpen<{ location: string }, void>().submit(undefined);
    await promise;
    expect(host.workspace.detachedTypes).toContain("journal-view:a");
  });

  it("describes the target open mode in the modal", async () => {
    const { host, flows, modals } = build({ a: seedView("a", { leaf: "tab" }) });
    await seedOpenLeaf(host, "a");
    flows.invoke(RepositionViewFlow, { viewId: "a" as ViewId });
    expect(modals.lastOpen<{ location: string }, void>().props.location).toBe(m.view_edit_leaf_tab());
  });

  it("returns UserAborted and leaves the view in place when cancelled", async () => {
    const { host, flows, modals } = build({ a: seedView("a", { leaf: "tab" }) });
    await seedOpenLeaf(host, "a");
    const promise = flows.invoke(RepositionViewFlow, { viewId: "a" as ViewId });
    modals.lastOpen().cancel();
    const result = await promise;
    expect(result.kind === "err" && result.error).toBeInstanceOf(UserAborted);
    expect(host.workspace.detachedTypes).toEqual([]);
  });

  it("does not open a modal when the view is closed", async () => {
    const { flows, modals } = build({ a: seedView("a", { leaf: "tab" }) });
    const result = await flows.invoke(RepositionViewFlow, { viewId: "a" as ViewId });
    expect(modals.opens.length).toBe(0);
    expect(result.kind).toBe("ok");
  });
});
