import { beforeEach, describe, expect, it, vi } from "vitest";

import { anchor } from "@/calendar/testing";
import { Flows, UserAborted } from "@/infrastructure/flows";
import type { VaultPath } from "@/infrastructure/host";
import { JournalsIndex } from "@/journals/journals-index";
import { journalsCoreModule } from "@/journals/module";
import { NoteConnectionService } from "@/journals/notes/note-connection";
import { JournalsRepository } from "@/journals/repository";
import { fixedJournal } from "@/journals/testing";
import { testContainer, type TestHarness } from "@/testing";

import { journalsSettingsCoreModule } from "../module";

import { EditNumberingDigitFlow } from "./edit-numbering-digit.flow";

import type { NumberingDigitDraft } from "../ui/modals";

const journalWithIndexDigit = fixedJournal(
  "j",
  { type: "day" },
  {
    numbering: {
      enabled: true,
      anchorDate: anchor(""),
      allowBefore: false,
      sources: [{ variable: "index", frontmatterKey: "journal-index", anchorValue: 1, reset: { kind: "never" } }],
    },
  },
);

const draft = (over: Partial<NumberingDigitDraft> = {}): NumberingDigitDraft => ({
  variable: "sprint",
  frontmatterKey: "journal-sprint",
  anchorValue: 1,
  reset: { kind: "after", count: 6 },
  ...over,
});

describe("EditNumberingDigitFlow", () => {
  let harness: TestHarness;

  beforeEach(async () => {
    harness = await testContainer({
      modules: [journalsCoreModule, journalsSettingsCoreModule],
      data: { journals: { j: journalWithIndexDigit } },
    });
  });

  it("appends a digit when no source index is given", async () => {
    const promise = harness.resolve(Flows).invoke(EditNumberingDigitFlow, { journalName: "j" });
    harness.modals.lastOpen<unknown, NumberingDigitDraft>().submit(draft());
    const result = await promise;

    expect(result.isOk()).toBe(true);
    expect(
      harness
        .resolve(JournalsRepository)
        .get("j")
        .getOrUndefined()
        ?.numbering.sources.map((s) => s.variable),
    ).toEqual(["index", "sprint"]);
  });

  it("replaces the digit at the given index", async () => {
    const promise = harness.resolve(Flows).invoke(EditNumberingDigitFlow, { journalName: "j", sourceIndex: 0 });
    harness.modals
      .lastOpen<unknown, NumberingDigitDraft>()
      .submit(draft({ variable: "release", frontmatterKey: "journal-index", reset: { kind: "never" } }));
    const result = await promise;

    expect(result.isOk()).toBe(true);
    const sources = harness.resolve(JournalsRepository).get("j").getOrUndefined()?.numbering.sources ?? [];
    expect(sources[0]?.variable).toBe("release");
    expect(sources).toHaveLength(1);
  });

  it("moves the stored value across when the property key changes", async () => {
    const path = "2026-06-01.md" as VaultPath;
    harness.host.putFile(path, "content", { journal: "j", "journal-date": "2026-06-01", "journal-index": 3 });
    harness.resolve(JournalsIndex).register({ journalName: "j", anchor: anchor("2026-06-01"), path });
    const promise = harness.resolve(Flows).invoke(EditNumberingDigitFlow, { journalName: "j", sourceIndex: 0 });
    harness.modals
      .lastOpen<unknown, NumberingDigitDraft>()
      .submit(draft({ variable: "release", frontmatterKey: "journal-release", reset: { kind: "never" } }));
    await promise;

    expect(harness.host.files.get(path)?.frontmatter).toEqual({
      journal: "j",
      "journal-date": "2026-06-01",
      "journal-release": 3,
    });
  });

  it("does not rename the property when the key is unchanged", async () => {
    const connection = harness.resolve(NoteConnectionService);
    const spy = vi.spyOn(connection, "renameFieldAll");
    const promise = harness.resolve(Flows).invoke(EditNumberingDigitFlow, { journalName: "j", sourceIndex: 0 });
    harness.modals
      .lastOpen<unknown, NumberingDigitDraft>()
      .submit(draft({ variable: "release", frontmatterKey: "journal-index", reset: { kind: "never" } }));
    await promise;

    expect(spy).not.toHaveBeenCalled();
  });

  it("returns the appended digit's variable on submit", async () => {
    const promise = harness.resolve(Flows).invoke(EditNumberingDigitFlow, { journalName: "j" });
    harness.modals.lastOpen<unknown, NumberingDigitDraft>().submit(draft());
    const result = await promise;

    expect(result.isOk() && result.value).toEqual({ variable: "sprint" });
  });

  it("returns UserAborted and leaves sources unchanged when the modal is cancelled", async () => {
    const promise = harness.resolve(Flows).invoke(EditNumberingDigitFlow, { journalName: "j" });
    harness.modals.lastOpen().cancel();
    const result = await promise;

    expect(result.isErr()).toBe(true);
    expect(result.isErr() && result.error).toBeInstanceOf(UserAborted);
    expect(
      harness
        .resolve(JournalsRepository)
        .get("j")
        .getOrUndefined()
        ?.numbering.sources.map((s) => s.variable),
    ).toEqual(["index"]);
  });

  it("errors for an unknown journal", async () => {
    harness = await testContainer({ modules: [journalsCoreModule, journalsSettingsCoreModule] });
    const result = await harness.resolve(Flows).invoke(EditNumberingDigitFlow, { journalName: "missing" });

    expect(result.isErr()).toBe(true);
  });

  it("errors for a source index that does not exist", async () => {
    const result = await harness.resolve(Flows).invoke(EditNumberingDigitFlow, { journalName: "j", sourceIndex: 9 });

    expect(result.isErr()).toBe(true);
  });
});
