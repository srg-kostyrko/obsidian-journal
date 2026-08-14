import { createNanoEvents } from "nanoevents";
import { describe, expect, it, vi } from "vitest";

import { CalendarDate } from "@/calendar";
import { anchor } from "@/calendar/testing";
import { m } from "@/i18n";
import { Flows, FlowsModule } from "@/infrastructure/flows";
import { CommandService, NoticeService, WorkspaceService } from "@/infrastructure/host";
import type { VaultPath } from "@/infrastructure/host";
import { createFakeHost } from "@/infrastructure/host/internal/testing";
import { InternalPluginToken } from "@/infrastructure/host/internal/tokens";
import { FakeNoticeService, FakeWorkspaceService } from "@/infrastructure/host/testing";
import { AsyncResult } from "@/infrastructure/result";
import {
  CycleService,
  JournalsIndex,
  JournalsRepository,
  JournalsEventsToken,
  OpenDateFlow,
  TimelineService,
  journalConfigCollection,
} from "@/journals";
import type { JournalsEvents } from "@/journals";
import { SettingsEventsToken } from "@/settings";
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

  const journalsStorage = settings.recordOf(journalConfigCollection);
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
  const notices = new FakeNoticeService();

  container.register(InternalPluginToken).useValue(host.plugin);
  container.register(CommandService).useClass(CommandService);
  container.register(WorkspaceService).useValue(workspace as unknown as WorkspaceService);
  container.register(NoticeService).useValue(notices);
  container.register(JournalsIndex).useClass(JournalsIndex);
  container.register(CycleService).useClass(CycleService);
  container.register(TimelineService).useClass(TimelineService);
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
  const settingsEvents = container.resolve(SettingsEventsToken);
  const registry = container.resolve(DynamicCommandRegistry);
  registry.initialize();

  return {
    host,
    workspace,
    notices,
    journalsRepo,
    shelvesRepo,
    commandsRepo,
    commandsStorage,
    settingsEvents,
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

  it("prefixes a journal-targeted command's palette name with the journal name", async () => {
    const { host, commandsRepo } = await build();
    commandsRepo.create(
      "cmd-1",
      makeCommand({ name: "Open today", target: { kind: "journal", journalName: "daily" } }),
    );
    expect(host.commands.get("cmd-1")?.name).toBe("daily: Open today");
  });

  it("prefixes a shelf-targeted command's palette name with the shelf name", async () => {
    const { host, commandsRepo } = await build();
    commandsRepo.create(
      "cmd-1",
      makeCommand({ name: "Open today", target: { kind: "shelf", shelfName: "work", writeType: "day" } }),
    );
    expect(host.commands.get("cmd-1")?.name).toBe("Shelf: work: Open today");
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

  it("registers a command synced into storage when settings are reloaded", async () => {
    const { host, commandsStorage, settingsEvents } = await build();
    commandsStorage["cmd-1"] = makeCommand({ name: "Synced" });
    settingsEvents.emit("reloaded");
    expect(host.commands.get("cmd-1")?.name).toBe("Synced");
  });

  it("unregisters a command removed by a settings reload", async () => {
    const { host, commandsRepo, commandsStorage, settingsEvents } = await build();
    commandsRepo.create("cmd-1", makeCommand({}));
    delete commandsStorage["cmd-1"];
    settingsEvents.emit("reloaded");
    expect(host.commands.get("cmd-1")).toBeUndefined();
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

  it("is unavailable when the resolved date is past the journal's timeline end", async () => {
    const { host, commandsRepo, journalsRepo } = await build();
    journalsRepo.create("daily", { type: "day" });
    journalsRepo.update("daily", {
      timeline: { start: anchor("2020-01-01"), end: { kind: "date", date: anchor("2020-12-31") } },
    });
    commandsRepo.create("cmd-1", makeCommand({}));
    expect(host.commands.get("cmd-1")?.checkCallback?.(true)).toBe(false);
  });

  it("is unavailable for only_open_note context without an active journal note", async () => {
    const { host, commandsRepo, journalsRepo } = await build();
    journalsRepo.create("daily", { type: "day" });
    commandsRepo.create("cmd-1", makeCommand({ context: "only_open_note" }));
    expect(host.commands.get("cmd-1")?.checkCallback?.(true)).toBe(false);
  });

  it("is unavailable for only_open_note context when the active note belongs to no journal", async () => {
    const { host, commandsRepo, journalsRepo, workspace } = await build();
    journalsRepo.create("daily", { type: "day" });
    workspace.setActive("inbox/scratch.md" as VaultPath);
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

  it("is available for only_open_note context when the active note belongs to another journal", async () => {
    const { host, commandsRepo, journalsRepo, index, workspace } = await build();
    journalsRepo.create("daily", { type: "day" });
    journalsRepo.create("monthly", { type: "month" });
    const path = "monthly/2026-05.md" as VaultPath;
    index.register({ journalName: "monthly", anchor: anchor("2026-05-01"), path });
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

    expect(invokeSpy).toHaveBeenCalledWith(
      OpenDateFlow,
      {
        anchor: CalendarDate.today().toAnchor(),
        journalNames: ["daily"],
        openMode: "split",
        existingOnly: false,
      },
      { context: { command: "Cmd" } },
    );
  });

  it("does not invoke OpenDateFlow when the resolved date is outside the timeline", async () => {
    const { host, commandsRepo, journalsRepo, flows } = await build();
    journalsRepo.create("daily", { type: "day" });
    journalsRepo.update("daily", {
      timeline: { start: anchor("2020-01-01"), end: { kind: "date", date: anchor("2020-12-31") } },
    });
    const invokeSpy = vi.spyOn(flows, "invoke");
    commandsRepo.create("cmd-1", makeCommand({}));

    host.commands.get("cmd-1")?.checkCallback?.(false);

    expect(invokeSpy).not.toHaveBeenCalled();
  });

  it("passes only in-timeline journals to OpenDateFlow", async () => {
    const { host, commandsRepo, journalsRepo, flows } = await build();
    journalsRepo.create("daily", { type: "day" });
    journalsRepo.create("archive", { type: "day" });
    journalsRepo.update("archive", {
      timeline: { start: anchor("2020-01-01"), end: { kind: "date", date: anchor("2020-12-31") } },
    });
    const invokeSpy = vi.spyOn(flows, "invoke").mockReturnValue(AsyncResult.ok({ path: "daily/x.md", created: false }));
    commandsRepo.create("cmd-1", makeCommand({}));

    host.commands.get("cmd-1")?.checkCallback?.(false);

    expect(invokeSpy).toHaveBeenCalledWith(
      OpenDateFlow,
      expect.objectContaining({ journalNames: ["daily"] }),
      expect.anything(),
    );
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

    expect(invokeSpy).toHaveBeenCalledWith(
      OpenDateFlow,
      {
        anchor: anchor("2026-05-10"),
        journalNames: ["daily"],
        openMode: "active",
        existingOnly: false,
      },
      { context: { command: "Cmd" } },
    );
  });

  it("dates an open_note command from a note in a journal it does not target", async () => {
    const { host, commandsRepo, journalsRepo, index, workspace, flows } = await build();
    journalsRepo.create("daily", { type: "day" });
    journalsRepo.create("monthly", { type: "month" });
    const path = "daily/2026-05-21.md" as VaultPath;
    index.register({ journalName: "daily", anchor: anchor("2026-05-21"), path });
    workspace.setActive(path);
    const invokeSpy = vi
      .spyOn(flows, "invoke")
      .mockReturnValue(AsyncResult.ok({ path: "monthly/x.md", created: false }));
    commandsRepo.create(
      "cmd-1",
      makeCommand({ target: { kind: "all", writeType: "month" }, type: "next", context: "open_note" }),
    );

    host.commands.get("cmd-1")?.checkCallback?.(false);

    expect(invokeSpy).toHaveBeenCalledWith(
      OpenDateFlow,
      expect.objectContaining({ anchor: anchor("2026-06-01"), journalNames: ["monthly"] }),
      expect.anything(),
    );
  });

  it("dates an only_open_note command from a note in a journal it does not target", async () => {
    const { host, commandsRepo, journalsRepo, index, workspace, flows } = await build();
    journalsRepo.create("daily", { type: "day" });
    journalsRepo.create("monthly", { type: "month" });
    const path = "daily/2026-05-21.md" as VaultPath;
    index.register({ journalName: "daily", anchor: anchor("2026-05-21"), path });
    workspace.setActive(path);
    const invokeSpy = vi
      .spyOn(flows, "invoke")
      .mockReturnValue(AsyncResult.ok({ path: "monthly/x.md", created: false }));
    commandsRepo.create(
      "cmd-1",
      makeCommand({ target: { kind: "all", writeType: "month" }, type: "next", context: "only_open_note" }),
    );

    host.commands.get("cmd-1")?.checkCallback?.(false);

    expect(invokeSpy).toHaveBeenCalledWith(
      OpenDateFlow,
      expect.objectContaining({ anchor: anchor("2026-06-01"), journalNames: ["monthly"] }),
      expect.anything(),
    );
  });

  it("falls back to today for open_note context without an active journal note", async () => {
    const { host, commandsRepo, journalsRepo, flows } = await build();
    journalsRepo.create("daily", { type: "day" });
    const invokeSpy = vi.spyOn(flows, "invoke").mockReturnValue(AsyncResult.ok({ path: "daily/x.md", created: false }));
    commandsRepo.create("cmd-1", makeCommand({ type: "same", context: "open_note" }));

    host.commands.get("cmd-1")?.checkCallback?.(false);

    expect(invokeSpy).toHaveBeenCalledWith(
      OpenDateFlow,
      {
        anchor: CalendarDate.today().toAnchor(),
        journalNames: ["daily"],
        openMode: "active",
        existingOnly: false,
      },
      { context: { command: "Cmd" } },
    );
  });
});

describe("DynamicCommandRegistry available types", () => {
  it("opens the nearest earlier existing note for a previous_available command", async () => {
    const { host, commandsRepo, journalsRepo, index, workspace, flows } = await build();
    journalsRepo.create("daily", { type: "day" });
    const activePath = "daily/2030-03-12.md" as VaultPath;
    index.register({ journalName: "daily", anchor: anchor("2030-03-12"), path: activePath });
    index.register({ journalName: "daily", anchor: anchor("2030-03-10"), path: "daily/2030-03-10.md" as VaultPath });
    workspace.setActive(activePath);
    const invokeSpy = vi
      .spyOn(flows, "invoke")
      .mockReturnValue(AsyncResult.ok({ path: "daily/2030-03-10.md", created: false }));
    commandsRepo.create("cmd-1", makeCommand({ type: "previous_available", context: "open_note" }));

    host.commands.get("cmd-1")?.checkCallback?.(false);

    expect(invokeSpy).toHaveBeenCalledWith(
      OpenDateFlow,
      {
        anchor: anchor("2030-03-10"),
        journalNames: ["daily"],
        openMode: "active",
        existingOnly: true,
      },
      { context: { command: "Cmd" } },
    );
  });

  it("notices instead of opening when no earlier note exists for a previous_available command", async () => {
    const { host, commandsRepo, journalsRepo, index, workspace, notices, flows } = await build();
    journalsRepo.create("daily", { type: "day" });
    const activePath = "daily/2030-03-12.md" as VaultPath;
    index.register({ journalName: "daily", anchor: anchor("2030-03-12"), path: activePath });
    workspace.setActive(activePath);
    const invokeSpy = vi.spyOn(flows, "invoke");
    commandsRepo.create("cmd-1", makeCommand({ type: "previous_available", context: "open_note" }));

    host.commands.get("cmd-1")?.checkCallback?.(false);

    expect(notices.messages).toContain(m.command_open_no_previous());
    expect(invokeSpy).not.toHaveBeenCalled();
  });

  it("stays listed for a next_available command when the target has a journal but no note is found", async () => {
    const { host, commandsRepo, journalsRepo } = await build();
    journalsRepo.create("daily", { type: "day" });
    commandsRepo.create("cmd-1", makeCommand({ type: "next_available", context: "today" }));

    expect(host.commands.get("cmd-1")?.checkCallback?.(true)).toBe(true);
  });

  it("notices from the ribbon when the open note does not belong to the target journals", async () => {
    const { host, commandsRepo, journalsRepo, workspace, notices } = await build();
    journalsRepo.create("daily", { type: "day" });
    workspace.setActive("inbox/scratch.md" as VaultPath);
    commandsRepo.create(
      "cmd-1",
      makeCommand({ type: "next_available", context: "only_open_note", icon: "star", showInRibbon: true }),
    );

    host.ribbonIcons[0]?.callback(new MouseEvent("click"));

    expect(notices.messages).toContain(m.command_open_needs_active_note());
  });

  it("notices when the target has no journal of the command's write type", async () => {
    const { host, commandsRepo, journalsRepo, notices } = await build();
    journalsRepo.create("daily", { type: "day" });
    commandsRepo.create("cmd-1", makeCommand({ type: "next_available", target: { kind: "all", writeType: "week" } }));

    host.commands.get("cmd-1")?.checkCallback?.(false);

    expect(notices.messages).toContain(m.command_open_unavailable());
  });

  it("notices when a same-period command cannot resolve a note", async () => {
    const { host, commandsRepo, journalsRepo, notices } = await build();
    journalsRepo.create("daily", { type: "day" });
    commandsRepo.create("cmd-1", makeCommand({ type: "same", context: "only_open_note" }));

    host.commands.get("cmd-1")?.checkCallback?.(false);

    expect(notices.messages).toContain(m.command_open_needs_active_note());
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
    expect(host.commands.get("cmd-1")?.name).toBe("Shelf: work: Open work daily");
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
