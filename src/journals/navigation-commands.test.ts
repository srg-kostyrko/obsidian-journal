import { describe, expect, it } from "vitest";

import { anchor } from "@/calendar/testing";
import { Container } from "@/infrastructure/di";
import { CommandService, WorkspaceService } from "@/infrastructure/host";
import type { VaultPath } from "@/infrastructure/host";
import { createFakeHost } from "@/infrastructure/host/internal/testing";
import { InternalPluginToken } from "@/infrastructure/host/internal/tokens";
import { FakeWorkspaceService } from "@/infrastructure/host/testing";
import { LoggerModule } from "@/infrastructure/logger";

import { JournalsIndex } from "./journals-index";
import { JournalNavigationCommands } from "./navigation-commands";

const FIRST = "daily/2026-05-01.md" as VaultPath;
const SECOND = "daily/2026-05-02.md" as VaultPath;
const ORPHAN = "notes/orphan.md" as VaultPath;

function build(): {
  host: ReturnType<typeof createFakeHost>;
  workspace: FakeWorkspaceService;
  index: JournalsIndex;
} {
  const host = createFakeHost();
  const workspace = new FakeWorkspaceService();
  const c = new Container();
  c.addModule(LoggerModule);
  c.register(InternalPluginToken).useValue(host.plugin);
  c.register(CommandService).useClass(CommandService);
  c.register(WorkspaceService).useValue(workspace as unknown as WorkspaceService);
  c.register(JournalsIndex).useClass(JournalsIndex);
  c.register(JournalNavigationCommands).useClass(JournalNavigationCommands);

  const index = c.resolve(JournalsIndex);
  index.register({ journalName: "daily", anchor: anchor("2026-05-01"), path: FIRST });
  index.register({ journalName: "daily", anchor: anchor("2026-05-02"), path: SECOND });

  c.resolve(JournalNavigationCommands);
  return { host, workspace, index };
}

describe("JournalNavigationCommands", () => {
  it("makes open-next available when a following entry exists", () => {
    const { host, workspace } = build();
    workspace.setActive(FIRST);
    expect(host.commands.get("open-next")?.checkCallback?.(true)).toBe(true);
  });

  it("makes open-next unavailable when no following entry exists", () => {
    const { host, workspace } = build();
    workspace.setActive(SECOND);
    expect(host.commands.get("open-next")?.checkCallback?.(true)).toBe(false);
  });

  it("makes open-prev unavailable when no preceding entry exists", () => {
    const { host, workspace } = build();
    workspace.setActive(FIRST);
    expect(host.commands.get("open-prev")?.checkCallback?.(true)).toBe(false);
  });

  it("makes open-next unavailable when the active note is not a journal note", () => {
    const { host, workspace } = build();
    workspace.setActive(ORPHAN);
    expect(host.commands.get("open-next")?.checkCallback?.(true)).toBe(false);
  });

  it("opens the following entry when open-next runs", () => {
    const { host, workspace } = build();
    workspace.setActive(FIRST);
    host.commands.get("open-next")?.checkCallback?.(false);
    expect(workspace.isOpen(SECOND)).toBe(true);
  });

  it("opens the preceding entry when open-prev runs", () => {
    const { host, workspace } = build();
    workspace.setActive(SECOND);
    host.commands.get("open-prev")?.checkCallback?.(false);
    expect(workspace.isOpen(FIRST)).toBe(true);
  });
});
