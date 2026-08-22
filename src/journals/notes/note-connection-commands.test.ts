import { beforeEach, describe, expect, it, vi } from "vitest";

import { WorkspaceService } from "@/infrastructure/host";
import type { VaultPath } from "@/infrastructure/host";
import { testContainer, type TestHarness } from "@/testing";

import { journalsModule } from "../module";

describe("NoteConnectionCommands", () => {
  let harness: TestHarness;

  beforeEach(async () => {
    harness = await testContainer({
      modules: [journalsModule],
      data: { journals: {} },
      allow: { hostState: true },
    });
  });

  // The fake vault models no `workspace.activeEditor`, so the real WorkspaceService can only ever
  // answer false. The editor is the one piece of host state this command reads that the vault
  // cannot hold.
  function setActiveEditor(present: boolean): void {
    vi.spyOn(harness.resolve(WorkspaceService), "hasActiveEditor").mockReturnValue(present);
  }

  function setActive(path: VaultPath): void {
    harness.host.emitActiveLeafChange(harness.host.putFile(path));
  }

  function connectCheck() {
    return harness.host.commands.get("connect-note")?.checkCallback?.(true);
  }

  it("registers the connect-note command", () => {
    setActive("note.md" as VaultPath);
    setActiveEditor(true);

    expect([...harness.host.commands.keys()]).toContain("connect-note");
  });

  it("is unavailable when no markdown editor is active", () => {
    setActiveEditor(false);

    expect(connectCheck()).toBe(false);
  });

  it("is unavailable in a non-editor context even when a file is active", () => {
    setActive("scan.pdf" as VaultPath);
    setActiveEditor(false);

    expect(connectCheck()).toBe(false);
  });

  it("is available when a markdown editor is active", () => {
    setActive("note.md" as VaultPath);
    setActiveEditor(true);

    expect(connectCheck()).toBe(true);
  });

  it("invokes the flow with the active note path", () => {
    setActive("note.md" as VaultPath);
    setActiveEditor(true);

    harness.host.commands.get("connect-note")?.checkCallback?.(false);

    expect(harness.modals.lastOpen().props).toEqual({ path: "note.md" });
  });
});
