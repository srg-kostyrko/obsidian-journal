import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { m } from "@/i18n";
import type { Module } from "@/infrastructure/di";
import { NoteCreateError, NotesService } from "@/infrastructure/host";
import type { VaultPath } from "@/infrastructure/host";
import { BufferSink, BufferSinkToken } from "@/infrastructure/logger";
import type { LogRecord } from "@/infrastructure/logger";
import { AsyncResult } from "@/infrastructure/result";
import { expectErr, expectOk } from "@/infrastructure/result/testing";
import { testContainer, type TestHarness } from "@/testing";

import { loggingCoreModule } from "../module";

import { DumpLogsFlow } from "./dump-logs.flow";

const record: LogRecord = { timestamp: Date.parse("2026-06-04T12:30:00Z"), level: "warn", name: "x", message: "hi" };

const NAME = /^journal-log-\d{8}-\d{6}\.md$/;

function bufferSinkModule(): Module {
  return {
    register(c) {
      c.register(BufferSinkToken).useClass(BufferSink);
    },
  };
}

async function build(records: readonly LogRecord[]): Promise<TestHarness> {
  const harness = await testContainer({ modules: [loggingCoreModule, bufferSinkModule()] });
  const buffer = harness.resolve(BufferSinkToken);
  for (const r of records) buffer.write(r);
  return harness;
}

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
      const harness = await build([record]);
      const result = await harness.resolve(DumpLogsFlow).execute();
      expectOk(result);
      const path = harness.host.files.keys().find((candidate) => NAME.test(candidate));
      expect(harness.host.files.get(path!)?.content).toContain("hi");
    });

    it("shows a success notice naming the created note", async () => {
      const harness = await build([record]);
      await harness.resolve(DumpLogsFlow).execute();
      expect(harness.notices.messages).toContainEqual(expect.stringMatching(/journal-log-\d{8}-\d{6}\.md/));
    });
  });

  describe("with an empty buffer", () => {
    it("creates no note", async () => {
      const harness = await build([]);
      const result = await harness.resolve(DumpLogsFlow).execute();
      expectOk(result);
      expect(harness.host.files.size).toBe(0);
    });

    it("shows a notice", async () => {
      const harness = await build([]);
      await harness.resolve(DumpLogsFlow).execute();
      expect(harness.notices.messages).toContain(m.logging_dump_empty());
    });
  });

  describe("when the note cannot be written", () => {
    it("propagates the create error", async () => {
      const harness = await build([record]);
      vi.spyOn(harness.resolve(NotesService), "create").mockReturnValue(
        AsyncResult.err(new NoteCreateError("journal-log.md" as VaultPath, new Error("disk full"))),
      );
      const result = await harness.resolve(DumpLogsFlow).execute();
      expectErr(result);
    });

    it("shows a failure notice", async () => {
      const harness = await build([record]);
      vi.spyOn(harness.resolve(NotesService), "create").mockReturnValue(
        AsyncResult.err(new NoteCreateError("journal-log.md" as VaultPath, new Error("disk full"))),
      );
      await harness.resolve(DumpLogsFlow).execute();
      expect(harness.notices.messages).toContain(m.logging_dump_failed());
    });
  });
});
