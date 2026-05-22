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
import { CycleService, JournalsIndex, OpenDateFlow, journalConfigCollection } from "@/journals";
import { JournalLifecycleService } from "@/journals/settings/lifecycle";
import { createSettingsService } from "@/settings/testing";
import { shelvesCollection } from "@/shelves";

import { DynamicCommandRegistry } from "./command-registry";
import { commandCollection } from "./config";

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
  const host = createFakeHost();
  const workspace = new FakeWorkspaceService();
  container.register(InternalPluginToken).useValue(host.plugin);
  container.register(CommandService).useClass(CommandService);
  container.register(WorkspaceService).useValue(workspace as unknown as WorkspaceService);
  container.register(JournalsIndex).useClass(JournalsIndex);
  container.register(CycleService).useClass(CycleService);
  container.register(JournalLifecycleService).useClass(JournalLifecycleService);
  container.addModule(FlowsModule);
  container.register(DynamicCommandRegistry).useClass(DynamicCommandRegistry);

  await settings.initialize();
  const lifecycle = container.resolve(JournalLifecycleService);
  const index = container.resolve(JournalsIndex);
  const flows = container.resolve(Flows);
  const registry = container.resolve(DynamicCommandRegistry);
  registry.initialize();

  return {
    host,
    workspace,
    settings,
    lifecycle,
    index,
    flows,
    commands: settings.getCollection(commandCollection),
    shelves: settings.getCollection(shelvesCollection),
  };
}

describe("DynamicCommandRegistry registration", () => {
  it("registers a command added to the collection", async () => {
    const { host, commands } = await build();
    commands.add("cmd-1", makeCommand({ name: "Open daily" }));
    expect(host.commands.get("cmd-1")?.name).toBe("Open daily");
  });

  it("unregisters a command removed from the collection", async () => {
    const { host, commands } = await build();
    commands.add("cmd-1", makeCommand({}));
    commands.remove("cmd-1");
    expect(host.commands.get("cmd-1")).toBeUndefined();
  });

  it("re-registers a command when its definition changes", async () => {
    const { host, commands } = await build();
    commands.add("cmd-1", makeCommand({ name: "Old" }));
    const stored = commands.get("cmd-1");
    if (stored) stored.name = "New";
    expect(host.commands.get("cmd-1")?.name).toBe("New");
  });

  it("keeps a single ribbon icon when a ribbon command is updated", async () => {
    const { host, commands } = await build();
    commands.add("cmd-1", makeCommand({ name: "Old", icon: "star", showInRibbon: true }));
    const stored = commands.get("cmd-1");
    if (stored) stored.name = "New";
    expect(host.ribbonIcons).toHaveLength(1);
  });
});

describe("DynamicCommandRegistry availability", () => {
  it("is unavailable when no journal matches an all target", async () => {
    const { host, commands } = await build();
    commands.add("cmd-1", makeCommand({}));
    expect(host.commands.get("cmd-1")?.checkCallback?.(true)).toBe(false);
  });

  it("is available when a matching journal exists", async () => {
    const { host, commands, lifecycle } = await build();
    lifecycle.create("daily", { type: "day" });
    commands.add("cmd-1", makeCommand({}));
    expect(host.commands.get("cmd-1")?.checkCallback?.(true)).toBe(true);
  });

  it("is unavailable when the command type is unsupported for the write type", async () => {
    const { host, commands, lifecycle } = await build();
    lifecycle.create("weekly", { type: "week" });
    commands.add("cmd-1", makeCommand({ target: { kind: "all", writeType: "week" }, type: "same_next_week" }));
    expect(host.commands.get("cmd-1")?.checkCallback?.(true)).toBe(false);
  });

  it("is unavailable for only_open_note context without a matching active note", async () => {
    const { host, commands, lifecycle } = await build();
    lifecycle.create("daily", { type: "day" });
    commands.add("cmd-1", makeCommand({ context: "only_open_note" }));
    expect(host.commands.get("cmd-1")?.checkCallback?.(true)).toBe(false);
  });

  it("is available for only_open_note context when the active note belongs to the target", async () => {
    const { host, commands, lifecycle, index, workspace } = await build();
    lifecycle.create("daily", { type: "day" });
    const path = "daily/2026-05-21.md" as VaultPath;
    index.register({ journalName: "daily", anchor: anchor("2026-05-21"), path });
    workspace.setActive(path);
    commands.add("cmd-1", makeCommand({ context: "only_open_note" }));
    expect(host.commands.get("cmd-1")?.checkCallback?.(true)).toBe(true);
  });
});

describe("DynamicCommandRegistry execution", () => {
  it("invokes OpenDateFlow with the resolved anchor and candidate journals", async () => {
    const { host, commands, lifecycle, flows } = await build();
    lifecycle.create("daily", { type: "day" });
    const invokeSpy = vi.spyOn(flows, "invoke").mockReturnValue(AsyncResult.ok({ path: "daily/x.md", created: false }));
    commands.add("cmd-1", makeCommand({ type: "same", context: "today", openMode: "split" }));

    host.commands.get("cmd-1")?.checkCallback?.(false);

    expect(invokeSpy).toHaveBeenCalledWith(OpenDateFlow, {
      anchor: CalendarDate.today().toAnchor(),
      journalNames: ["daily"],
      openMode: "split",
      existingOnly: false,
    });
  });

  it("does not invoke OpenDateFlow when the command is unavailable", async () => {
    const { host, commands, flows } = await build();
    const invokeSpy = vi.spyOn(flows, "invoke");
    commands.add("cmd-1", makeCommand({}));

    host.commands.get("cmd-1")?.checkCallback?.(false);

    expect(invokeSpy).not.toHaveBeenCalled();
  });

  it("resolves the anchor from the active note for open_note context", async () => {
    const { host, commands, lifecycle, index, workspace, flows } = await build();
    lifecycle.create("daily", { type: "day" });
    const path = "daily/2026-05-10.md" as VaultPath;
    index.register({ journalName: "daily", anchor: anchor("2026-05-10"), path });
    workspace.setActive(path);
    const invokeSpy = vi.spyOn(flows, "invoke").mockReturnValue(AsyncResult.ok({ path: "daily/x.md", created: false }));
    commands.add("cmd-1", makeCommand({ type: "same", context: "open_note" }));

    host.commands.get("cmd-1")?.checkCallback?.(false);

    expect(invokeSpy).toHaveBeenCalledWith(OpenDateFlow, {
      anchor: anchor("2026-05-10"),
      journalNames: ["daily"],
      openMode: "active",
      existingOnly: false,
    });
  });

  it("falls back to today for open_note context without an active journal note", async () => {
    const { host, commands, lifecycle, flows } = await build();
    lifecycle.create("daily", { type: "day" });
    const invokeSpy = vi.spyOn(flows, "invoke").mockReturnValue(AsyncResult.ok({ path: "daily/x.md", created: false }));
    commands.add("cmd-1", makeCommand({ type: "same", context: "open_note" }));

    host.commands.get("cmd-1")?.checkCallback?.(false);

    expect(invokeSpy).toHaveBeenCalledWith(OpenDateFlow, {
      anchor: CalendarDate.today().toAnchor(),
      journalNames: ["daily"],
      openMode: "active",
      existingOnly: false,
    });
  });
});

function makeJournal(name: string, writeType: "day" | "week") {
  return {
    name,
    write: { type: writeType },
    timeline: { start: "", end: { kind: "never" as const } },
    dateFormat: "YYYY-MM-DD",
    frontmatter: {
      dateField: "journal-date",
      startDateField: "journal-start-date",
      endDateField: "journal-end-date",
      addStartDate: false,
      addEndDate: false,
    },
    numbering: { enabled: false, anchorDate: "", allowBefore: false, sources: [] },
  };
}

describe("DynamicCommandRegistry journal cascade", () => {
  it("rewrites the journal name on rename and keeps the command registered", async () => {
    const { host, commands, lifecycle } = await build();
    lifecycle.create("daily", { type: "day" });
    commands.add("cmd-1", makeCommand({ target: { kind: "journal", journalName: "daily" } }));

    lifecycle.rename("daily", "morning");

    expect(commands.get("cmd-1")?.target).toEqual({ kind: "journal", journalName: "morning" });
    expect(host.commands.get("cmd-1")).toBeDefined();
  });

  it("leaves a journal-target command for an unrelated journal untouched on rename", async () => {
    const { commands, lifecycle } = await build();
    lifecycle.create("daily", { type: "day" });
    lifecycle.create("weekly", { type: "week" });
    commands.add("cmd-1", makeCommand({ target: { kind: "journal", journalName: "weekly" } }));

    lifecycle.rename("daily", "morning");

    expect(commands.get("cmd-1")?.target).toEqual({ kind: "journal", journalName: "weekly" });
  });

  it("removes a journal-target command when its journal is deleted", async () => {
    const { host, commands, lifecycle } = await build();
    lifecycle.create("daily", { type: "day" });
    commands.add("cmd-1", makeCommand({ target: { kind: "journal", journalName: "daily" } }));

    lifecycle.delete("daily");

    expect(commands.get("cmd-1")).toBeUndefined();
    expect(host.commands.get("cmd-1")).toBeUndefined();
  });

  it("leaves an all-target command untouched when a journal is deleted", async () => {
    const { commands, lifecycle } = await build();
    lifecycle.create("daily", { type: "day" });
    commands.add("cmd-1", makeCommand({ target: { kind: "all", writeType: "day" } }));

    lifecycle.delete("daily");

    expect(commands.get("cmd-1")).toBeDefined();
  });
});

describe("DynamicCommandRegistry shelf targets", () => {
  it("registers a shelf-targeted command when the shelf has a matching journal", async () => {
    const { host, settings, commands, shelves } = await build();
    settings.getCollection(journalConfigCollection).add("daily", makeJournal("daily", "day"));
    shelves.add("work", { name: "work", journals: ["daily"] });
    commands.add(
      "cmd-1",
      makeCommand({ name: "Open work daily", target: { kind: "shelf", shelfName: "work", writeType: "day" } }),
    );
    expect(host.commands.get("cmd-1")?.name).toBe("Open work daily");
  });

  it("hides a shelf-targeted command when the shelf has no journal of the write type", async () => {
    const { host, settings, commands, shelves } = await build();
    settings.getCollection(journalConfigCollection).add("daily", makeJournal("daily", "day"));
    shelves.add("work", { name: "work", journals: ["daily"] });
    commands.add(
      "cmd-1",
      makeCommand({ name: "Open work weekly", target: { kind: "shelf", shelfName: "work", writeType: "week" } }),
    );
    expect(host.commands.get("cmd-1")?.checkCallback?.(true)).toBe(false);
  });
});
