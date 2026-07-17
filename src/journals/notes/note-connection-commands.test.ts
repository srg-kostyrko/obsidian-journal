import { describe, expect, it, vi } from "vitest";

import { Container } from "@/infrastructure/di";
import { Flows } from "@/infrastructure/flows";
import {
  CommandService,
  WorkspaceService,
  type CommandRegistration,
  type VaultPath,
  NoticeService,
} from "@/infrastructure/host";
import { FakeNoticeService } from "@/infrastructure/host/testing";
import { AsyncResult, Option } from "@/infrastructure/result";

import { NoteConnectionCommands } from "./note-connection-commands";

function build(options: { active?: VaultPath; hasEditor: boolean }) {
  const c = new Container();
  const registered: CommandRegistration[] = [];
  c.register(CommandService).useValue({
    register: (r: CommandRegistration) => registered.push(r),
  } as unknown as CommandService);
  c.register(WorkspaceService).useValue({
    activeNote: () => Option.fromNullable(options.active),
    hasActiveEditor: () => options.hasEditor,
  } as unknown as WorkspaceService);
  const invoke = vi.fn(() => AsyncResult.ok());
  c.register(NoticeService).useValue(new FakeNoticeService());
  c.register(Flows).useValue({ invoke } as unknown as Flows);
  c.register(NoteConnectionCommands).useClass(NoteConnectionCommands).eager();
  c.resolve(NoteConnectionCommands);
  return { registered, invoke };
}

function connectCheck(registered: CommandRegistration[]): boolean | undefined {
  return registered.find((r) => r.id === "connect-note")?.check?.();
}

describe("NoteConnectionCommands", () => {
  it("registers the connect-note command", () => {
    const { registered } = build({ active: "note.md" as VaultPath, hasEditor: true });
    expect(registered.map((r) => r.id)).toContain("connect-note");
  });

  it("is unavailable when no markdown editor is active", () => {
    const { registered } = build({ hasEditor: false });
    expect(connectCheck(registered)).toBe(false);
  });

  it("is unavailable in a non-editor context even when a file is active", () => {
    const { registered } = build({ active: "scan.pdf" as VaultPath, hasEditor: false });
    expect(connectCheck(registered)).toBe(false);
  });

  it("is available when a markdown editor is active", () => {
    const { registered } = build({ active: "note.md" as VaultPath, hasEditor: true });
    expect(connectCheck(registered)).toBe(true);
  });

  it("invokes the flow with the active note path", () => {
    const { registered, invoke } = build({ active: "note.md" as VaultPath, hasEditor: true });
    void registered.find((r) => r.id === "connect-note")?.execute();
    expect(invoke).toHaveBeenCalledWith(expect.anything(), { path: "note.md" });
  });
});
