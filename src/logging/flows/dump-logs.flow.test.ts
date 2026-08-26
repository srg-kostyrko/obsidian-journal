import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { m } from "@/i18n";
import { NoteCreateError, NotesService } from "@/infrastructure/host";
import type { VaultPath } from "@/infrastructure/host";
import { BufferSinkToken } from "@/infrastructure/logger";
import type { LogRecord } from "@/infrastructure/logger";
import { AsyncResult } from "@/infrastructure/result";
import { expectErr, expectOk } from "@/infrastructure/result/testing";
import { testContainer, type TestHarness } from "@/testing";

import { loggingCoreModule } from "../module";

import { DumpLogsFlow } from "./dump-logs.flow";

const record: LogRecord = { timestamp: Date.parse("2026-06-04T12:30:00Z"), level: "warn", name: "x", message: "hi" };

const NAME = /^journal-log-\d{8}-\d{6}\.md$/;

async function build(records: readonly LogRecord[]): Promise<TestHarness> {
  const harness = await testContainer({ modules: [loggingCoreModule] });
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

  describe("resolution", () => {
    it("resolves through the logger testing module alone, with no hand-supplied BufferSinkToken", async () => {
      const harness = await testContainer({ modules: [loggingCoreModule] });
      expect(() => harness.resolve(DumpLogsFlow)).not.toThrow();
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
