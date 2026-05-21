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
    collections: [journalConfigCollection, commandCollection],
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

  return { host, workspace, settings, lifecycle, index, flows, commands: settings.getCollection(commandCollection) };
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
});
