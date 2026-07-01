import { describe, expect, it, vi } from "vitest";

import { Container } from "@/infrastructure/di";
import { Flows } from "@/infrastructure/flows";
import { CommandService, WorkspaceService, type CommandRegistration, type VaultPath } from "@/infrastructure/host";
import { AsyncResult, Option } from "@/infrastructure/result";

import { NoteConnectionCommands } from "./note-connection-commands";

function build(active: VaultPath | undefined) {
  const c = new Container();
  const registered: CommandRegistration[] = [];
  c.register(CommandService).useValue({
    register: (r: CommandRegistration) => registered.push(r),
  } as unknown as CommandService);
  c.register(WorkspaceService).useValue({
    activeNote: () => Option.fromNullable(active),
  } as unknown as WorkspaceService);
  const invoke = vi.fn(() => AsyncResult.ok());
  c.register(Flows).useValue({ invoke } as unknown as Flows);
  c.register(NoteConnectionCommands).useClass(NoteConnectionCommands).eager();
  c.resolve(NoteConnectionCommands);
  return { registered, invoke };
}

describe("NoteConnectionCommands", () => {
  it("registers the connect-note command", () => {
    const { registered } = build("note.md" as VaultPath);
    expect(registered.map((r) => r.id)).toContain("connect-note");
  });

  it("is unavailable when there is no active note", () => {
    const { registered } = build(undefined);
    expect(registered.find((r) => r.id === "connect-note")?.check?.()).toBe(false);
  });

  it("invokes the flow with the active note path", () => {
    const { registered, invoke } = build("note.md" as VaultPath);
    void registered.find((r) => r.id === "connect-note")?.execute();
    expect(invoke).toHaveBeenCalledWith(expect.anything(), { path: "note.md" });
  });
});
