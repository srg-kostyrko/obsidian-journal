import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { Container } from "@/infrastructure/di";
import { NoteCreateError, NoticeService, NotesService } from "@/infrastructure/host";
import type { NoteAlreadyExistsError, Note, VaultPath } from "@/infrastructure/host";
import { BufferSink, BufferSinkToken } from "@/infrastructure/logger";
import type { LogRecord } from "@/infrastructure/logger";
import { AsyncResult } from "@/infrastructure/result";
import { expectErr, expectOk } from "@/infrastructure/result/testing";

import { DumpLogsFlow } from "./dump-logs.flow";

const record: LogRecord = { timestamp: Date.parse("2026-06-04T12:30:00Z"), level: "warn", name: "x", message: "hi" };

function makeNote(path: VaultPath): Note {
  return { path, basename: "", folder: "" as VaultPath, size: 0, mtime: 0 };
}

function build(records: readonly LogRecord[]) {
  const buffer = new BufferSink();
  for (const r of records) buffer.write(r);
  const notes = {
    create: vi.fn((path: VaultPath): AsyncResult<Note, NoteAlreadyExistsError | NoteCreateError> =>
      AsyncResult.ok(makeNote(path)),
    ),
  };
  const notices: NoticeService = { show: vi.fn() };
  const c = new Container();
  c.register(BufferSinkToken).useValue(buffer);
  c.register(NotesService).useValue(notes as unknown as NotesService);
  c.register(NoticeService).useValue(notices);
  c.register(DumpLogsFlow).useClass(DumpLogsFlow);
  return { flow: c.resolve(DumpLogsFlow), notes, notices };
}

const NAME = /^journal-log-\d{8}-\d{6}\.md$/;

describe("DumpLogsFlow", () => {
  describe("with buffered records", () => {
    beforeEach(() => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2026-06-04T12:30:00Z"));
    });
    afterEach(() => {
      vi.useRealTimers();
    });

    it("creates a timestamped note containing the buffered records", async () => {
      const { flow, notes } = build([record]);
      const result = await flow.execute();
      expectOk(result);
      expect(notes.create).toHaveBeenCalledWith(expect.stringMatching(NAME), expect.stringContaining("hi"));
    });

    it("shows a success notice naming the created note", async () => {
      const { flow, notices } = build([record]);
      await flow.execute();
      expect(notices.show).toHaveBeenCalledWith(expect.stringMatching(/journal-log-\d{8}-\d{6}\.md/));
    });
  });

  describe("with an empty buffer", () => {
    it("creates no note", async () => {
      const { flow, notes } = build([]);
      const result = await flow.execute();
      expectOk(result);
      expect(notes.create).not.toHaveBeenCalled();
    });

    it("shows a notice", async () => {
      const { flow, notices } = build([]);
      await flow.execute();
      expect(notices.show).toHaveBeenCalledWith(expect.stringContaining("No log messages"));
    });
  });

  describe("when the note cannot be written", () => {
    it("propagates the create error", async () => {
      const { flow, notes } = build([record]);
      notes.create.mockReturnValueOnce(
        AsyncResult.err(new NoteCreateError("journal-log.md" as VaultPath, new Error("disk full"))),
      );
      const result = await flow.execute();
      expectErr(result);
    });

    it("shows a failure notice", async () => {
      const { flow, notes, notices } = build([record]);
      notes.create.mockReturnValueOnce(
        AsyncResult.err(new NoteCreateError("journal-log.md" as VaultPath, new Error("disk full"))),
      );
      await flow.execute();
      expect(notices.show).toHaveBeenCalledWith(expect.stringContaining("Failed"));
    });
  });
});
