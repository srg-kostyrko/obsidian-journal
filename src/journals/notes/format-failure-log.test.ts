import { describe, expect, it } from "vitest";

import { testContainer } from "@/testing";

import { journalsCoreModule } from "../module";

import { JournalDateFormatError } from "./errors";
import { FormatFailureLog } from "./format-failure-log";

async function setup(): Promise<{ log: FormatFailureLog; warned: () => unknown[][] }> {
  const harness = await testContainer({ modules: [journalsCoreModule] });
  const warned = (): unknown[][] =>
    harness.logs.records
      .filter((record) => record.level === "warn")
      .map((record) => [record.fields?.journalName, record.fields?.pattern]);
  return { log: harness.resolve(FormatFailureLog), warned };
}

describe("FormatFailureLog", () => {
  it("warns once for a journal and pattern however often it fails", async () => {
    const { log, warned } = await setup();

    log.warnOnce("weekly", new JournalDateFormatError("weekly", "YYYYy", "eras"));
    log.warnOnce("weekly", new JournalDateFormatError("weekly", "YYYYy", "eras"));

    expect(warned()).toEqual([["weekly", "YYYYy"]]);
  });

  it("warns again for another pattern or another journal", async () => {
    const { log, warned } = await setup();

    log.warnOnce("weekly", new JournalDateFormatError("weekly", "YYYYy", "eras"));
    log.warnOnce("weekly", new JournalDateFormatError("weekly", "yyyy", "eras"));
    log.warnOnce("daily", new JournalDateFormatError("daily", "YYYYy", "eras"));

    expect(warned()).toEqual([
      ["weekly", "YYYYy"],
      ["weekly", "yyyy"],
      ["daily", "YYYYy"],
    ]);
  });
});
