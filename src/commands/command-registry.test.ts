import { createNanoEvents } from "nanoevents";
import { describe, expect, it, vi } from "vitest";

import { CalendarDate } from "@/calendar";
import { anchor } from "@/calendar/testing";
import { Flows, FlowsModule } from "@/infrastructure/flows";
import { CommandService, WorkspaceService } from "@/infrastructure/host";
import type { VaultPath } from "@/infrastructure/host";
import { createFakeHost } from "@/infrastructure/host/internal/testing";
import { InternalPluginToken } from "@/infrastructure/host/internal/tokens";
import { FakeWorkspaceService } from "@/infrastructure/host/testing";
import { AsyncResult } from "@/infrastructure/result";
import {
  CycleService,
  JournalsIndex,
  JournalsRepository,
  JournalsEventsToken,
  OpenDateFlow,
  journalConfigCollection,
} from "@/journals";
import type { JournalConfig, JournalsEvents } from "@/journals";
import { createSettingsService } from "@/settings/testing";
import { ShelvesRepository, ShelvesEventsToken, shelvesCollection } from "@/shelves";
import type { ShelvesEvents } from "@/shelves";

import { DynamicCommandRegistry } from "./command-registry";
import { commandCollection } from "./config";
import { CommandsRepository, type CommandsEvents } from "./repository";
import { CommandsEventsToken } from "./tokens";

import type { CommandConfig } from "./config";

function makeCommand(overrides: Partial<CommandConfig>): CommandConfig {
  return {
    name: "Cmd",
    icon: "",
    showInRibbon: false,
    openMode: "active",
    target: { kind: "all", writeType: "day" },
    type: "same",
    context: "today",
    ...overrides,
  };
}

async function build() {
  const { service: settings, container } = createSettingsService({
    collections: [journalConfigCollection, commandCollection, shelvesCollection],
  });
  await settings.initialize();

  const journalsStorage = settings.recordOf(journalConfigCollection) as Record<string, JournalConfig>;
  const shelvesStorage = settings.recordOf(shelvesCollection);
  const commandsStorage = settings.recordOf(commandCollection);

  const journalsEvents = createNanoEvents<JournalsEvents>();
  const shelvesEvents = createNanoEvents<ShelvesEvents>();
  const commandsEvents = createNanoEvents<CommandsEvents>();

  const journalsRepo = JournalsRepository.fromParts(journalsStorage, journalsEvents);
  const shelvesRepo = ShelvesRepository.fromParts(shelvesStorage, shelvesEvents);
  const commandsRepo = CommandsRepository.fromParts(commandsStorage, commandsEvents);

  const host = createFakeHost();
  const workspace = new FakeWorkspaceService();

  container.register(InternalPluginToken).useValue(host.plugin);
  container.register(CommandService).useClass(CommandService);
  container.register(WorkspaceService).useValue(workspace as unknown as WorkspaceService);
  container.register(JournalsIndex).useClass(JournalsIndex);
  container.register(CycleService).useClass(CycleService);
  container.register(JournalsEventsToken).useValue(journalsEvents);
  container.register(JournalsRepository).useValue(journalsRepo);
  container.register(ShelvesEventsToken).useValue(shelvesEvents);
  container.register(ShelvesRepository).useValue(shelvesRepo);
  container.register(CommandsEventsToken).useValue(commandsEvents);
  container.register(CommandsRepository).useValue(commandsRepo);
  container.addModule(FlowsModule);
  container.register(DynamicCommandRegistry).useClass(DynamicCommandRegistry);

  const index = container.resolve(JournalsIndex);
  const flows = container.resolve(Flows);
  const registry = container.resolve(DynamicCommandRegistry);
  registry.initialize();

  return {
    host,
    workspace,
    journalsRepo,
    shelvesRepo,
    commandsRepo,
    index,
    flows,
  };
}

describe("DynamicCommandRegistry registration", () => {
  it("registers a command added to the collection", async () => {
    const { host, commandsRepo } = await build();
    commandsRepo.create("cmd-1", makeCommand({ name: "Open daily" }));
    expect(host.commands.get("cmd-1")?.name).toBe("Open daily");
  });

  it("unregisters a command removed from the collection", async () => {
    const { host, commandsRepo } = await build();
    commandsRepo.create("cmd-1", makeCommand({}));
    commandsRepo.delete("cmd-1");
    expect(host.commands.get("cmd-1")).toBeUndefined();
  });

  it("re-registers a command when its definition changes", async () => {
    const { host, commandsRepo } = await build();
    commandsRepo.create("cmd-1", makeCommand({ name: "Old" }));
    commandsRepo.update("cmd-1", { name: "New" });
    expect(host.commands.get("cmd-1")?.name).toBe("New");
  });

  it("keeps a single ribbon icon when a ribbon command is updated", async () => {
    const { host, commandsRepo } = await build();
    commandsRepo.create("cmd-1", makeCommand({ name: "Old", icon: "star", showInRibbon: true }));
    commandsRepo.update("cmd-1", { name: "New" });
    expect(host.ribbonIcons).toHaveLength(1);
  });
});

describe("DynamicCommandRegistry availability", () => {
  it("is unavailable when no journal matches an all target", async () => {
    const { host, commandsRepo } = await build();
    commandsRepo.create("cmd-1", makeCommand({}));
    expect(host.commands.get("cmd-1")?.checkCallback?.(true)).toBe(false);
  });

  it("is available when a matching journal exists", async () => {
    const { host, commandsRepo, journalsRepo } = await build();
    journalsRepo.create("daily", { type: "day" });
    commandsRepo.create("cmd-1", makeCommand({}));
    expect(host.commands.get("cmd-1")?.checkCallback?.(true)).toBe(true);
  });

  it("is unavailable when the command type is unsupported for the write type", async () => {
    const { host, commandsRepo, journalsRepo } = await build();
    journalsRepo.create("weekly", { type: "week" });
    commandsRepo.create("cmd-1", makeCommand({ target: { kind: "all", writeType: "week" }, type: "same_next_week" }));
    expect(host.commands.get("cmd-1")?.checkCallback?.(true)).toBe(false);
  });

  it("is unavailable for only_open_note context without a matching active note", async () => {
    const { host, commandsRepo, journalsRepo } = await build();
    journalsRepo.create("daily", { type: "day" });
    commandsRepo.create("cmd-1", makeCommand({ context: "only_open_note" }));
    expect(host.commands.get("cmd-1")?.checkCallback?.(true)).toBe(false);
  });

  it("is available for only_open_note context when the active note belongs to the target", async () => {
    const { host, commandsRepo, journalsRepo, index, workspace } = await build();
    journalsRepo.create("daily", { type: "day" });
    const path = "daily/2026-05-21.md" as VaultPath;
    index.register({ journalName: "daily", anchor: anchor("2026-05-21"), path });
    workspace.setActive(path);
    commandsRepo.create("cmd-1", makeCommand({ context: "only_open_note" }));
    expect(host.commands.get("cmd-1")?.checkCallback?.(true)).toBe(true);
  });
});

describe("DynamicCommandRegistry execution", () => {
  it("invokes OpenDateFlow with the resolved anchor and candidate journals", async () => {
    const { host, commandsRepo, journalsRepo, flows } = await build();
    journalsRepo.create("daily", { type: "day" });
    const invokeSpy = vi.spyOn(flows, "invoke").mockReturnValue(AsyncResult.ok({ path: "daily/x.md", created: false }));
    commandsRepo.create("cmd-1", makeCommand({ type: "same", context: "today", openMode: "split" }));

    host.commands.get("cmd-1")?.checkCallback?.(false);

    expect(invokeSpy).toHaveBeenCalledWith(OpenDateFlow, {
      anchor: CalendarDate.today().toAnchor(),
      journalNames: ["daily"],
      openMode: "split",
      existingOnly: false,
    });
  });

  it("does not invoke OpenDateFlow when the command is unavailable", async () => {
    const { host, commandsRepo, flows } = await build();
    const invokeSpy = vi.spyOn(flows, "invoke");
    commandsRepo.create("cmd-1", makeCommand({}));

    host.commands.get("cmd-1")?.checkCallback?.(false);

    expect(invokeSpy).not.toHaveBeenCalled();
  });

  it("resolves the anchor from the active note for open_note context", async () => {
    const { host, commandsRepo, journalsRepo, index, workspace, flows } = await build();
    journalsRepo.create("daily", { type: "day" });
    const path = "daily/2026-05-10.md" as VaultPath;
    index.register({ journalName: "daily", anchor: anchor("2026-05-10"), path });
    workspace.setActive(path);
    const invokeSpy = vi.spyOn(flows, "invoke").mockReturnValue(AsyncResult.ok({ path: "daily/x.md", created: false }));
    commandsRepo.create("cmd-1", makeCommand({ type: "same", context: "open_note" }));

    host.commands.get("cmd-1")?.checkCallback?.(false);

    expect(invokeSpy).toHaveBeenCalledWith(OpenDateFlow, {
      anchor: anchor("2026-05-10"),
      journalNames: ["daily"],
      openMode: "active",
      existingOnly: false,
    });
  });

  it("falls back to today for open_note context without an active journal note", async () => {
    const { host, commandsRepo, journalsRepo, flows } = await build();
    journalsRepo.create("daily", { type: "day" });
    const invokeSpy = vi.spyOn(flows, "invoke").mockReturnValue(AsyncResult.ok({ path: "daily/x.md", created: false }));
    commandsRepo.create("cmd-1", makeCommand({ type: "same", context: "open_note" }));

    host.commands.get("cmd-1")?.checkCallback?.(false);

    expect(invokeSpy).toHaveBeenCalledWith(OpenDateFlow, {
      anchor: CalendarDate.today().toAnchor(),
      journalNames: ["daily"],
      openMode: "active",
      existingOnly: false,
    });
  });
});

describe("DynamicCommandRegistry journal cascade", () => {
  it("rewrites the journal name on rename and keeps the command registered", async () => {
    const { host, commandsRepo, journalsRepo } = await build();
    journalsRepo.create("daily", { type: "day" });
    commandsRepo.create("cmd-1", makeCommand({ target: { kind: "journal", journalName: "daily" } }));

    journalsRepo.rename("daily", "morning");

    expect(commandsRepo.get("cmd-1").getOr(makeCommand({}))?.target).toEqual({
      kind: "journal",
      journalName: "morning",
    });
    expect(host.commands.get("cmd-1")).toBeDefined();
  });

  it("leaves a journal-target command for an unrelated journal untouched on rename", async () => {
    const { commandsRepo, journalsRepo } = await build();
    journalsRepo.create("daily", { type: "day" });
    journalsRepo.create("weekly", { type: "week" });
    commandsRepo.create("cmd-1", makeCommand({ target: { kind: "journal", journalName: "weekly" } }));

    journalsRepo.rename("daily", "morning");

    expect(commandsRepo.get("cmd-1").getOr(makeCommand({}))?.target).toEqual({
      kind: "journal",
      journalName: "weekly",
    });
  });

  it("removes a journal-target command when its journal is deleted", async () => {
    const { host, commandsRepo, journalsRepo } = await build();
    journalsRepo.create("daily", { type: "day" });
    commandsRepo.create("cmd-1", makeCommand({ target: { kind: "journal", journalName: "daily" } }));

    journalsRepo.delete("daily");

    expect(commandsRepo.get("cmd-1").isNone()).toBe(true);
    expect(host.commands.get("cmd-1")).toBeUndefined();
  });

  it("leaves an all-target command untouched when a journal is deleted", async () => {
    const { commandsRepo, journalsRepo } = await build();
    journalsRepo.create("daily", { type: "day" });
    commandsRepo.create("cmd-1", makeCommand({ target: { kind: "all", writeType: "day" } }));

    journalsRepo.delete("daily");

    expect(commandsRepo.get("cmd-1").isSome()).toBe(true);
  });
});

describe("DynamicCommandRegistry shelf targets", () => {
  it("registers a shelf-targeted command when the shelf has a matching journal", async () => {
    const { host, commandsRepo, journalsRepo, shelvesRepo } = await build();
    journalsRepo.create("daily", { type: "day" });
    shelvesRepo.create("work");
    shelvesRepo.update("work", { journals: ["daily"] });
    commandsRepo.create(
      "cmd-1",
      makeCommand({ name: "Open work daily", target: { kind: "shelf", shelfName: "work", writeType: "day" } }),
    );
    expect(host.commands.get("cmd-1")?.name).toBe("Open work daily");
  });

  it("hides a shelf-targeted command when the shelf has no journal of the write type", async () => {
    const { host, commandsRepo, journalsRepo, shelvesRepo } = await build();
    journalsRepo.create("daily", { type: "day" });
    shelvesRepo.create("work");
    shelvesRepo.update("work", { journals: ["daily"] });
    commandsRepo.create(
      "cmd-1",
      makeCommand({ name: "Open work weekly", target: { kind: "shelf", shelfName: "work", writeType: "week" } }),
    );
    expect(host.commands.get("cmd-1")?.checkCallback?.(true)).toBe(false);
  });

  it("updates the shelf name on a shelf-targeted command when its shelf is renamed", async () => {
    const { commandsRepo, shelvesRepo } = await build();
    shelvesRepo.create("work");
    commandsRepo.create("cmd-1", makeCommand({ target: { kind: "shelf", shelfName: "work", writeType: "day" } }));
    shelvesRepo.rename("work", "office");
    const target = commandsRepo.get("cmd-1").getOr(makeCommand({}))?.target;
    expect(target).toEqual({ kind: "shelf", shelfName: "office", writeType: "day" });
  });

  it("removes a shelf-targeted command when its shelf is deleted", async () => {
    const { commandsRepo, shelvesRepo } = await build();
    shelvesRepo.create("work");
    commandsRepo.create("cmd-1", makeCommand({ target: { kind: "shelf", shelfName: "work", writeType: "day" } }));
    shelvesRepo.deleteWith("work");
    expect(commandsRepo.get("cmd-1").isNone()).toBe(true);
  });

  it("keeps a renamed shelf's command operational", async () => {
    const { host, commandsRepo, journalsRepo, shelvesRepo } = await build();
    journalsRepo.create("daily", { type: "day" });
    shelvesRepo.create("work");
    shelvesRepo.update("work", { journals: ["daily"] });
    commandsRepo.create("cmd-1", makeCommand({ target: { kind: "shelf", shelfName: "work", writeType: "day" } }));
    shelvesRepo.rename("work", "office");
    expect(host.commands.get("cmd-1")).toBeDefined();
    expect(host.commands.get("cmd-1")?.checkCallback?.(true)).toBe(true);
  });
});
