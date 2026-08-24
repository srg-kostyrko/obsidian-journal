import { describe, expect, it, vi } from "vitest";

import { CalendarDate } from "@/calendar";
import { anchor } from "@/calendar/testing";
import { m } from "@/i18n";
import { Flows } from "@/infrastructure/flows";
import type { VaultPath } from "@/infrastructure/host";
import type { FakeHost } from "@/infrastructure/host/internal/testing";
import { AsyncResult } from "@/infrastructure/result";
import { JournalsIndex, JournalsRepository, OpenDateFlow } from "@/journals";
import type { JournalConfig } from "@/journals";
import { journalsCoreModule } from "@/journals/module";
import { fixedJournal } from "@/journals/testing";
import { SettingsEventsToken } from "@/settings";
import { ShelvesRepository } from "@/shelves";
import type { ShelfConfig } from "@/shelves";
import { shelvesCoreModule } from "@/shelves/module";
import { buildShelf } from "@/shelves/testing";
import { testContainer } from "@/testing";

import { DynamicCommandRegistry } from "./command-registry";
import { commandCollection } from "./config";
import { commandsModule } from "./module";
import { CommandsRepository } from "./repository";
import { buildCommand } from "./testing";

import type { CommandConfig } from "./config";

interface RegistrySeed {
  readonly journals?: Record<string, JournalConfig>;
  readonly shelves?: Record<string, ShelfConfig>;
  readonly commands?: Record<string, CommandConfig>;
}

// The subject IS the host registration, so this is one of the few full-module boots:
// commandsModule brings the startup half that owns DynamicCommandRegistry, and
// allow.hostState lets the commands it registers stand.
async function buildRegistry(seed: RegistrySeed = {}) {
  const harness = await testContainer({
    modules: [journalsCoreModule, shelvesCoreModule, commandsModule],
    data: {
      journals: seed.journals ?? {},
      shelves: seed.shelves ?? {},
      commands: seed.commands ?? {},
    },
    allow: { hostState: true },
    initialize: [DynamicCommandRegistry],
  });
  return {
    host: harness.host,
    notices: harness.notices,
    index: harness.resolve(JournalsIndex),
    flows: harness.resolve(Flows),
    settingsEvents: harness.resolve(SettingsEventsToken),
    commandsRepo: harness.resolve(CommandsRepository),
    commandsStorage: harness.settings.recordOf(commandCollection),
    journalsRepo: harness.resolve(JournalsRepository),
    shelvesRepo: harness.resolve(ShelvesRepository),
  };
}

function activate(host: FakeHost, path: VaultPath): void {
  host.emitActiveLeafChange(host.putFile(path));
}

describe("DynamicCommandRegistry registration", () => {
  it("registers a command added to the collection", async () => {
    const { host, commandsRepo } = await buildRegistry();
    commandsRepo.create("cmd-1", buildCommand({ name: "Open daily" }));
    expect(host.commands.get("cmd-1")?.name).toBe("Open daily");
  });

  it("prefixes a journal-targeted command's palette name with the journal name", async () => {
    const { host, commandsRepo } = await buildRegistry();
    commandsRepo.create(
      "cmd-1",
      buildCommand({ name: "Open today", target: { kind: "journal", journalName: "daily" } }),
    );
    expect(host.commands.get("cmd-1")?.name).toBe("daily: Open today");
  });

  it("prefixes a shelf-targeted command's palette name with the shelf name", async () => {
    const { host, commandsRepo } = await buildRegistry();
    commandsRepo.create(
      "cmd-1",
      buildCommand({ name: "Open today", target: { kind: "shelf", shelfName: "work", writeType: "day" } }),
    );
    expect(host.commands.get("cmd-1")?.name).toBe("Shelf: work: Open today");
  });

  it("unregisters a command removed from the collection", async () => {
    const { host, commandsRepo } = await buildRegistry();
    commandsRepo.create("cmd-1", buildCommand());
    commandsRepo.delete("cmd-1");
    expect(host.commands.get("cmd-1")).toBeUndefined();
  });

  it("re-registers a command when its definition changes", async () => {
    const { host, commandsRepo } = await buildRegistry();
    commandsRepo.create("cmd-1", buildCommand({ name: "Old" }));
    commandsRepo.update("cmd-1", { name: "New" });
    expect(host.commands.get("cmd-1")?.name).toBe("New");
  });

  it("registers a command synced into storage when settings are reloaded", async () => {
    const { host, commandsStorage, settingsEvents } = await buildRegistry();
    commandsStorage["cmd-1"] = buildCommand({ name: "Synced" });
    settingsEvents.emit("reloaded");
    expect(host.commands.get("cmd-1")?.name).toBe("Synced");
  });

  it("unregisters a command removed by a settings reload", async () => {
    const { host, commandsStorage, settingsEvents } = await buildRegistry({
      commands: { "cmd-1": buildCommand() },
    });
    delete commandsStorage["cmd-1"];
    settingsEvents.emit("reloaded");
    expect(host.commands.get("cmd-1")).toBeUndefined();
  });

  it("keeps a single ribbon icon when a ribbon command is updated", async () => {
    const { host, commandsRepo } = await buildRegistry();
    commandsRepo.create("cmd-1", buildCommand({ name: "Old", icon: "star", showInRibbon: true }));
    commandsRepo.update("cmd-1", { name: "New" });
    expect(host.ribbonIcons).toHaveLength(1);
  });
});

describe("DynamicCommandRegistry availability", () => {
  it("is unavailable when no journal matches an all target", async () => {
    const { host } = await buildRegistry({ commands: { "cmd-1": buildCommand() } });
    expect(host.commands.get("cmd-1")?.checkCallback?.(true)).toBe(false);
  });

  it("is available when a matching journal exists", async () => {
    const { host } = await buildRegistry({
      journals: { daily: fixedJournal("daily", { type: "day" }) },
      commands: { "cmd-1": buildCommand() },
    });
    expect(host.commands.get("cmd-1")?.checkCallback?.(true)).toBe(true);
  });

  it("is unavailable when the command type is unsupported for the write type", async () => {
    const { host } = await buildRegistry({
      journals: { weekly: fixedJournal("weekly", { type: "week" }) },
      commands: { "cmd-1": buildCommand({ target: { kind: "all", writeType: "week" }, type: "same_next_week" }) },
    });
    expect(host.commands.get("cmd-1")?.checkCallback?.(true)).toBe(false);
  });

  it("is unavailable when the resolved date is past the journal's timeline end", async () => {
    const { host } = await buildRegistry({
      journals: {
        daily: fixedJournal(
          "daily",
          { type: "day" },
          { timeline: { start: anchor("2020-01-01"), end: { kind: "date", date: anchor("2020-12-31") } } },
        ),
      },
      commands: { "cmd-1": buildCommand() },
    });
    expect(host.commands.get("cmd-1")?.checkCallback?.(true)).toBe(false);
  });

  it("is unavailable for only_open_note context without an active journal note", async () => {
    const { host } = await buildRegistry({
      journals: { daily: fixedJournal("daily", { type: "day" }) },
      commands: { "cmd-1": buildCommand({ context: "only_open_note" }) },
    });
    expect(host.commands.get("cmd-1")?.checkCallback?.(true)).toBe(false);
  });

  it("is unavailable for only_open_note context when the active note belongs to no journal", async () => {
    const { host } = await buildRegistry({
      journals: { daily: fixedJournal("daily", { type: "day" }) },
      commands: { "cmd-1": buildCommand({ context: "only_open_note" }) },
    });
    activate(host, "inbox/scratch.md" as VaultPath);
    expect(host.commands.get("cmd-1")?.checkCallback?.(true)).toBe(false);
  });

  it("is available for only_open_note context when the active note belongs to the target", async () => {
    const { host, index } = await buildRegistry({
      journals: { daily: fixedJournal("daily", { type: "day" }) },
      commands: { "cmd-1": buildCommand({ context: "only_open_note" }) },
    });
    const path = "daily/2026-05-21.md" as VaultPath;
    index.register({ journalName: "daily", anchor: anchor("2026-05-21"), path });
    activate(host, path);
    expect(host.commands.get("cmd-1")?.checkCallback?.(true)).toBe(true);
  });

  it("is available for only_open_note context when the active note belongs to another journal", async () => {
    const { host, index } = await buildRegistry({
      journals: {
        daily: fixedJournal("daily", { type: "day" }),
        monthly: fixedJournal("monthly", { type: "month" }),
      },
      commands: { "cmd-1": buildCommand({ context: "only_open_note" }) },
    });
    const path = "monthly/2026-05.md" as VaultPath;
    index.register({ journalName: "monthly", anchor: anchor("2026-05-01"), path });
    activate(host, path);
    expect(host.commands.get("cmd-1")?.checkCallback?.(true)).toBe(true);
  });
});

describe("DynamicCommandRegistry execution", () => {
  it("invokes OpenDateFlow with the resolved anchor and candidate journals", async () => {
    const { host, flows } = await buildRegistry({
      journals: { daily: fixedJournal("daily", { type: "day" }) },
      commands: {
        "cmd-1": buildCommand({ name: "Cmd", type: "same", context: "today", openMode: "split" }),
      },
    });
    const invokeSpy = vi.spyOn(flows, "invoke").mockReturnValue(AsyncResult.ok({ path: "daily/x.md", created: false }));

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
    const { host, flows } = await buildRegistry({
      journals: {
        daily: fixedJournal(
          "daily",
          { type: "day" },
          { timeline: { start: anchor("2020-01-01"), end: { kind: "date", date: anchor("2020-12-31") } } },
        ),
      },
      commands: { "cmd-1": buildCommand() },
    });
    const invokeSpy = vi.spyOn(flows, "invoke");

    host.commands.get("cmd-1")?.checkCallback?.(false);

    expect(invokeSpy).not.toHaveBeenCalled();
  });

  it("passes only in-timeline journals to OpenDateFlow", async () => {
    const { host, flows } = await buildRegistry({
      journals: {
        daily: fixedJournal("daily", { type: "day" }),
        archive: fixedJournal(
          "archive",
          { type: "day" },
          { timeline: { start: anchor("2020-01-01"), end: { kind: "date", date: anchor("2020-12-31") } } },
        ),
      },
      commands: { "cmd-1": buildCommand() },
    });
    const invokeSpy = vi.spyOn(flows, "invoke").mockReturnValue(AsyncResult.ok({ path: "daily/x.md", created: false }));

    host.commands.get("cmd-1")?.checkCallback?.(false);

    expect(invokeSpy).toHaveBeenCalledWith(
      OpenDateFlow,
      expect.objectContaining({ journalNames: ["daily"] }),
      expect.anything(),
    );
  });

  it("does not invoke OpenDateFlow when the command is unavailable", async () => {
    const { host, flows } = await buildRegistry({ commands: { "cmd-1": buildCommand() } });
    const invokeSpy = vi.spyOn(flows, "invoke");

    host.commands.get("cmd-1")?.checkCallback?.(false);

    expect(invokeSpy).not.toHaveBeenCalled();
  });

  it("resolves the anchor from the active note for open_note context", async () => {
    const { host, index, flows } = await buildRegistry({
      journals: { daily: fixedJournal("daily", { type: "day" }) },
      commands: { "cmd-1": buildCommand({ name: "Cmd", type: "same", context: "open_note" }) },
    });
    const path = "daily/2026-05-10.md" as VaultPath;
    index.register({ journalName: "daily", anchor: anchor("2026-05-10"), path });
    activate(host, path);
    const invokeSpy = vi.spyOn(flows, "invoke").mockReturnValue(AsyncResult.ok({ path: "daily/x.md", created: false }));

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
    const { host, index, flows } = await buildRegistry({
      journals: {
        daily: fixedJournal("daily", { type: "day" }),
        monthly: fixedJournal("monthly", { type: "month" }),
      },
      commands: {
        "cmd-1": buildCommand({ target: { kind: "all", writeType: "month" }, type: "next", context: "open_note" }),
      },
    });
    const path = "daily/2026-05-21.md" as VaultPath;
    index.register({ journalName: "daily", anchor: anchor("2026-05-21"), path });
    activate(host, path);
    const invokeSpy = vi
      .spyOn(flows, "invoke")
      .mockReturnValue(AsyncResult.ok({ path: "monthly/x.md", created: false }));

    host.commands.get("cmd-1")?.checkCallback?.(false);

    expect(invokeSpy).toHaveBeenCalledWith(
      OpenDateFlow,
      expect.objectContaining({ anchor: anchor("2026-06-01"), journalNames: ["monthly"] }),
      expect.anything(),
    );
  });

  it("dates an only_open_note command from a note in a journal it does not target", async () => {
    const { host, index, flows } = await buildRegistry({
      journals: {
        daily: fixedJournal("daily", { type: "day" }),
        monthly: fixedJournal("monthly", { type: "month" }),
      },
      commands: {
        "cmd-1": buildCommand({ target: { kind: "all", writeType: "month" }, type: "next", context: "only_open_note" }),
      },
    });
    const path = "daily/2026-05-21.md" as VaultPath;
    index.register({ journalName: "daily", anchor: anchor("2026-05-21"), path });
    activate(host, path);
    const invokeSpy = vi
      .spyOn(flows, "invoke")
      .mockReturnValue(AsyncResult.ok({ path: "monthly/x.md", created: false }));

    host.commands.get("cmd-1")?.checkCallback?.(false);

    expect(invokeSpy).toHaveBeenCalledWith(
      OpenDateFlow,
      expect.objectContaining({ anchor: anchor("2026-06-01"), journalNames: ["monthly"] }),
      expect.anything(),
    );
  });

  it("falls back to today for open_note context without an active journal note", async () => {
    const { host, flows } = await buildRegistry({
      journals: { daily: fixedJournal("daily", { type: "day" }) },
      commands: { "cmd-1": buildCommand({ name: "Cmd", type: "same", context: "open_note" }) },
    });
    const invokeSpy = vi.spyOn(flows, "invoke").mockReturnValue(AsyncResult.ok({ path: "daily/x.md", created: false }));

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
    const { host, index, flows } = await buildRegistry({
      journals: { daily: fixedJournal("daily", { type: "day" }) },
      commands: { "cmd-1": buildCommand({ name: "Cmd", type: "previous_available", context: "open_note" }) },
    });
    const activePath = "daily/2030-03-12.md" as VaultPath;
    index.register({ journalName: "daily", anchor: anchor("2030-03-12"), path: activePath });
    index.register({ journalName: "daily", anchor: anchor("2030-03-10"), path: "daily/2030-03-10.md" as VaultPath });
    activate(host, activePath);
    const invokeSpy = vi
      .spyOn(flows, "invoke")
      .mockReturnValue(AsyncResult.ok({ path: "daily/2030-03-10.md", created: false }));

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
    const { host, index, notices, flows } = await buildRegistry({
      journals: { daily: fixedJournal("daily", { type: "day" }) },
      commands: { "cmd-1": buildCommand({ type: "previous_available", context: "open_note" }) },
    });
    const activePath = "daily/2030-03-12.md" as VaultPath;
    index.register({ journalName: "daily", anchor: anchor("2030-03-12"), path: activePath });
    activate(host, activePath);
    const invokeSpy = vi.spyOn(flows, "invoke");

    host.commands.get("cmd-1")?.checkCallback?.(false);

    expect(notices.messages).toContain(m.command_open_no_previous());
    expect(invokeSpy).not.toHaveBeenCalled();
  });

  it("stays listed for a next_available command when the target has a journal but no note is found", async () => {
    const { host } = await buildRegistry({
      journals: { daily: fixedJournal("daily", { type: "day" }) },
      commands: { "cmd-1": buildCommand({ type: "next_available", context: "today" }) },
    });

    expect(host.commands.get("cmd-1")?.checkCallback?.(true)).toBe(true);
  });

  it("notices from the ribbon when the open note does not belong to the target journals", async () => {
    const { host, notices } = await buildRegistry({
      journals: { daily: fixedJournal("daily", { type: "day" }) },
      commands: {
        "cmd-1": buildCommand({
          type: "next_available",
          context: "only_open_note",
          icon: "star",
          showInRibbon: true,
        }),
      },
    });
    activate(host, "inbox/scratch.md" as VaultPath);

    host.ribbonIcons[0]?.callback(new MouseEvent("click"));

    expect(notices.messages).toContain(m.command_open_needs_active_note());
  });

  it("notices when the target has no journal of the command's write type", async () => {
    const { host, notices } = await buildRegistry({
      journals: { daily: fixedJournal("daily", { type: "day" }) },
      commands: { "cmd-1": buildCommand({ type: "next_available", target: { kind: "all", writeType: "week" } }) },
    });

    host.commands.get("cmd-1")?.checkCallback?.(false);

    expect(notices.messages).toContain(m.command_open_unavailable());
  });

  it("notices when a same-period command cannot resolve a note", async () => {
    const { host, notices } = await buildRegistry({
      journals: { daily: fixedJournal("daily", { type: "day" }) },
      commands: { "cmd-1": buildCommand({ type: "same", context: "only_open_note" }) },
    });

    host.commands.get("cmd-1")?.checkCallback?.(false);

    expect(notices.messages).toContain(m.command_open_needs_active_note());
  });
});

describe("DynamicCommandRegistry journal cascade", () => {
  it("rewrites the journal name on rename and keeps the command registered", async () => {
    const { host, commandsRepo, journalsRepo } = await buildRegistry({
      journals: { daily: fixedJournal("daily", { type: "day" }) },
      commands: { "cmd-1": buildCommand({ target: { kind: "journal", journalName: "daily" } }) },
    });

    journalsRepo.rename("daily", "morning");

    expect(commandsRepo.get("cmd-1").getOr(buildCommand())?.target).toEqual({
      kind: "journal",
      journalName: "morning",
    });
    expect(host.commands.get("cmd-1")).toBeDefined();
  });

  it("leaves a journal-target command for an unrelated journal untouched on rename", async () => {
    const { commandsRepo, journalsRepo } = await buildRegistry({
      journals: {
        daily: fixedJournal("daily", { type: "day" }),
        weekly: fixedJournal("weekly", { type: "week" }),
      },
      commands: { "cmd-1": buildCommand({ target: { kind: "journal", journalName: "weekly" } }) },
    });

    journalsRepo.rename("daily", "morning");

    expect(commandsRepo.get("cmd-1").getOr(buildCommand())?.target).toEqual({
      kind: "journal",
      journalName: "weekly",
    });
  });

  it("removes a journal-target command when its journal is deleted", async () => {
    const { host, commandsRepo, journalsRepo } = await buildRegistry({
      journals: { daily: fixedJournal("daily", { type: "day" }) },
      commands: { "cmd-1": buildCommand({ target: { kind: "journal", journalName: "daily" } }) },
    });

    journalsRepo.delete("daily");

    expect(commandsRepo.get("cmd-1").isNone()).toBe(true);
    expect(host.commands.get("cmd-1")).toBeUndefined();
  });

  it("leaves an all-target command untouched when a journal is deleted", async () => {
    const { commandsRepo, journalsRepo } = await buildRegistry({
      journals: { daily: fixedJournal("daily", { type: "day" }) },
      commands: { "cmd-1": buildCommand({ target: { kind: "all", writeType: "day" } }) },
    });

    journalsRepo.delete("daily");

    expect(commandsRepo.get("cmd-1").isSome()).toBe(true);
  });
});

function commandsTargeting(commandsRepo: CommandsRepository, journalName: string): [string, CommandConfig][] {
  return [...commandsRepo.find().entries()].filter(
    ([, command]) => command.target.kind === "journal" && command.target.journalName === journalName,
  );
}

describe("DynamicCommandRegistry journal cloning", () => {
  it("copies a journal-target command onto the clone", async () => {
    const { commandsRepo, journalsRepo } = await buildRegistry({
      journals: { daily: fixedJournal("daily", { type: "day" }) },
      commands: {
        "cmd-1": buildCommand({
          name: "Open today",
          icon: "sun",
          showInRibbon: true,
          target: { kind: "journal", journalName: "daily" },
        }),
      },
    });

    journalsRepo.clone("daily", "daily copy");

    const copies = commandsTargeting(commandsRepo, "daily copy");
    expect(copies).toHaveLength(1);
    expect(copies.at(0)?.[1]).toEqual(
      buildCommand({
        name: "Open today",
        icon: "sun",
        showInRibbon: true,
        target: { kind: "journal", journalName: "daily copy" },
      }),
    );
  });

  it("gives the copied command its own id and leaves the source command in place", async () => {
    const { commandsRepo, journalsRepo } = await buildRegistry({
      journals: { daily: fixedJournal("daily", { type: "day" }) },
      commands: { "cmd-1": buildCommand({ target: { kind: "journal", journalName: "daily" } }) },
    });

    journalsRepo.clone("daily", "daily copy");

    expect(commandsTargeting(commandsRepo, "daily")).toHaveLength(1);
    expect(commandsTargeting(commandsRepo, "daily copy").at(0)?.[0]).not.toBe("cmd-1");
  });

  it("registers the copied command with the host", async () => {
    const { host, commandsRepo, journalsRepo } = await buildRegistry({
      journals: { daily: fixedJournal("daily", { type: "day" }) },
      commands: { "cmd-1": buildCommand({ target: { kind: "journal", journalName: "daily" } }) },
    });

    journalsRepo.clone("daily", "daily copy");

    const copyId = commandsTargeting(commandsRepo, "daily copy").at(0)?.[0] ?? "";
    expect(host.commands.get(copyId)).toBeDefined();
  });

  it("leaves commands targeting other journals alone", async () => {
    const { commandsRepo, journalsRepo } = await buildRegistry({
      journals: {
        daily: fixedJournal("daily", { type: "day" }),
        weekly: fixedJournal("weekly", { type: "week" }),
      },
      commands: { "cmd-1": buildCommand({ target: { kind: "journal", journalName: "weekly" } }) },
    });

    const before = commandsRepo.count();
    journalsRepo.clone("daily", "daily copy");

    expect(commandsTargeting(commandsRepo, "daily copy")).toHaveLength(0);
    expect(commandsRepo.count()).toBe(before);
  });

  it("does not copy all-target commands", async () => {
    const { commandsRepo, journalsRepo } = await buildRegistry({
      journals: { daily: fixedJournal("daily", { type: "day" }) },
      commands: { "cmd-1": buildCommand({ target: { kind: "all", writeType: "day" } }) },
    });

    const before = commandsRepo.count();
    journalsRepo.clone("daily", "daily copy");

    expect(commandsRepo.count()).toBe(before);
  });
});

describe("DynamicCommandRegistry shelf targets", () => {
  it("registers a shelf-targeted command when the shelf has a matching journal", async () => {
    const { host } = await buildRegistry({
      journals: { daily: fixedJournal("daily", { type: "day" }) },
      shelves: { work: buildShelf("work", { journals: ["daily"] }) },
      commands: {
        "cmd-1": buildCommand({
          name: "Open work daily",
          target: { kind: "shelf", shelfName: "work", writeType: "day" },
        }),
      },
    });
    expect(host.commands.get("cmd-1")?.name).toBe("Shelf: work: Open work daily");
  });

  it("hides a shelf-targeted command when the shelf has no journal of the write type", async () => {
    const { host } = await buildRegistry({
      journals: { daily: fixedJournal("daily", { type: "day" }) },
      shelves: { work: buildShelf("work", { journals: ["daily"] }) },
      commands: {
        "cmd-1": buildCommand({
          name: "Open work weekly",
          target: { kind: "shelf", shelfName: "work", writeType: "week" },
        }),
      },
    });
    expect(host.commands.get("cmd-1")?.checkCallback?.(true)).toBe(false);
  });

  it("updates the shelf name on a shelf-targeted command when its shelf is renamed", async () => {
    const { commandsRepo, shelvesRepo } = await buildRegistry({
      journals: { daily: fixedJournal("daily", { type: "day" }) },
      shelves: { work: buildShelf("work"), other: buildShelf("other") },
      commands: {
        "cmd-1": buildCommand({ target: { kind: "shelf", shelfName: "work", writeType: "day" } }),
        "cmd-2": buildCommand({ target: { kind: "shelf", shelfName: "other", writeType: "day" } }),
        "cmd-3": buildCommand({ target: { kind: "journal", journalName: "daily" } }),
      },
    });
    shelvesRepo.rename("work", "office");
    const target = commandsRepo.get("cmd-1").getOr(buildCommand())?.target;
    expect(target).toEqual({ kind: "shelf", shelfName: "office", writeType: "day" });
    // Non-matching shelf and non-shelf targets are untouched by the cascade.
    expect(commandsRepo.get("cmd-2").getOr(buildCommand())?.target).toEqual({
      kind: "shelf",
      shelfName: "other",
      writeType: "day",
    });
    expect(commandsRepo.get("cmd-3").getOr(buildCommand())?.target).toEqual({ kind: "journal", journalName: "daily" });
  });

  it("removes a shelf-targeted command when its shelf is deleted", async () => {
    const { commandsRepo, shelvesRepo } = await buildRegistry({
      journals: { daily: fixedJournal("daily", { type: "day" }) },
      shelves: { work: buildShelf("work"), other: buildShelf("other") },
      commands: {
        "cmd-1": buildCommand({ target: { kind: "shelf", shelfName: "work", writeType: "day" } }),
        "cmd-2": buildCommand({ target: { kind: "shelf", shelfName: "other", writeType: "day" } }),
        "cmd-3": buildCommand({ target: { kind: "journal", journalName: "daily" } }),
      },
    });
    shelvesRepo.deleteWith("work");
    expect(commandsRepo.get("cmd-1").isNone()).toBe(true);
    // Non-matching shelf and non-shelf targets survive the deletion cascade.
    expect(commandsRepo.get("cmd-2").isSome()).toBe(true);
    expect(commandsRepo.get("cmd-3").isSome()).toBe(true);
  });

  it("keeps a renamed shelf's command operational", async () => {
    const { host, shelvesRepo } = await buildRegistry({
      journals: { daily: fixedJournal("daily", { type: "day" }) },
      shelves: { work: buildShelf("work", { journals: ["daily"] }) },
      commands: { "cmd-1": buildCommand({ target: { kind: "shelf", shelfName: "work", writeType: "day" } }) },
    });
    shelvesRepo.rename("work", "office");
    expect(host.commands.get("cmd-1")).toBeDefined();
    expect(host.commands.get("cmd-1")?.checkCallback?.(true)).toBe(true);
  });
});
