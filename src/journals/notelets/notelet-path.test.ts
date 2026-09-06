import { assert, describe, expect, it } from "vitest";

import { anchor } from "@/calendar/testing";
import type { VaultPath } from "@/infrastructure/host";
import { testContainer, type TestHarness } from "@/testing";

import { JournalsIndex } from "../journals-index";
import { journalsCoreModule } from "../module";
import { JournalsRepository } from "../repository";
import { buildNoteletType, fixedJournal, unwrap } from "../testing";

import { NoteletPathService } from "./notelet-path";

import type { NoteletType } from "./config";
import type { NoteletMetadata } from "../types";

const TYPE_ID = "nt_1" as never;

async function harnessWith(type: Partial<NoteletType>, extra: Record<string, unknown> = {}): Promise<TestHarness> {
  return testContainer({
    modules: [journalsCoreModule],
    data: {
      journals: {
        daily: fixedJournal(
          "daily",
          { type: "day" },
          {
            ...extra,
            notelets: { nt_1: buildNoteletType({ id: TYPE_ID, name: "Standup", ...type }) },
          },
        ),
      },
    },
  });
}

function meta(overrides: Partial<NoteletMetadata> = {}): NoteletMetadata {
  return { kind: "notelet", journalName: "daily", anchor: anchor("2026-01-01"), typeId: TYPE_ID, ...overrides };
}

describe("NoteletPathService", () => {
  it("renders the type's name template", async () => {
    const harness = await harnessWith({ nameTemplate: "Standup {{date:YYYY-MM-DD}}" });
    const config = unwrap(harness.resolve(JournalsRepository).get("daily"));
    const type = config.notelets.nt_1;
    assert(type !== undefined);

    const path = harness.resolve(NoteletPathService).availablePathFor(config, type, meta());

    expect(path.isOk() && path.value).toBe("Standup 2026-01-01.md");
  });

  it("renders the type's folder, with the note name fed back", async () => {
    const harness = await harnessWith({ nameTemplate: "Standup", folder: "Notes/{{note_name}}" });
    const config = unwrap(harness.resolve(JournalsRepository).get("daily"));
    const type = config.notelets.nt_1;
    assert(type !== undefined);

    const path = harness.resolve(NoteletPathService).availablePathFor(config, type, meta());

    expect(path.isOk() && path.value).toBe("Notes/Standup/Standup.md");
  });

  it("renders the journal's numbering digits", async () => {
    const harness = await harnessWith(
      { nameTemplate: "Sprint {{index}}" },
      {
        numbering: {
          enabled: true,
          anchorDate: anchor("2026-01-01"),
          allowBefore: false,
          sources: [{ variable: "index", frontmatterKey: "journal-index", anchorValue: 4, reset: { kind: "never" } }],
        },
      },
    );
    const config = unwrap(harness.resolve(JournalsRepository).get("daily"));
    const type = config.notelets.nt_1;
    assert(type !== undefined);

    const path = harness.resolve(NoteletPathService).availablePathFor(config, type, meta());

    // Assert the digit assignNumbers actually produces for this config — the behavior under
    // test is that the journal's digits reach a notelet name, not one arithmetic result.
    expect(path.isOk() && path.value).toBe("Sprint 4.md");
  });

  it("renders the journal's prompt answers empty, never the period note's stored answer", async () => {
    const harness = await harnessWith(
      { nameTemplate: "Standup {{mood}}" },
      { prompts: [{ type: "text", variable: "mood", question: "Mood?", frontmatterKey: "mood", required: false }] },
    );
    const config = unwrap(harness.resolve(JournalsRepository).get("daily"));
    const type = config.notelets.nt_1;
    assert(type !== undefined);
    // A period note actually carrying a stored answer, so the assertion below distinguishes
    // "the answer was excluded" from "there was no answer to exclude in the first place".
    harness.resolve(JournalsIndex).register({
      journalName: "daily",
      anchor: anchor("2026-01-01"),
      path: "period.md" as VaultPath,
      answers: { mood: "great" },
    });

    const path = harness.resolve(NoteletPathService).availablePathFor(config, type, meta());

    // The literal space before {{mood}} in the template survives an empty binding —
    // NotePathService.pathFor never trims a rendered name, so neither does this.
    expect(path.isOk() && path.value).toBe("Standup .md");
  });

  it("renders the type's own prompt answers", async () => {
    const harness = await harnessWith({
      nameTemplate: "1o1 with {{who}}",
      prompts: [{ type: "text", variable: "who", question: "Who?", frontmatterKey: "with", required: false }],
    });
    const config = unwrap(harness.resolve(JournalsRepository).get("daily"));
    const type = config.notelets.nt_1;
    assert(type !== undefined);

    const path = harness
      .resolve(NoteletPathService)
      .availablePathFor(config, type, meta({ answers: { who: "Alice" } }));

    expect(path.isOk() && path.value).toBe("1o1 with Alice.md");
  });

  it("starts notelet_index at 1 when the period has none of this type", async () => {
    const harness = await harnessWith({ nameTemplate: "Standup {{notelet_index}}" });
    const config = unwrap(harness.resolve(JournalsRepository).get("daily"));
    const type = config.notelets.nt_1;
    assert(type !== undefined);

    const path = harness.resolve(NoteletPathService).availablePathFor(config, type, meta());

    expect(path.isOk() && path.value).toBe("Standup 1.md");
  });

  it("takes the highest stored counter of this type in this period, plus one", async () => {
    const harness = await harnessWith({ nameTemplate: "Standup {{notelet_index}}" });
    const index = harness.resolve(JournalsIndex);
    index.register({
      kind: "notelet",
      journalName: "daily",
      anchor: anchor("2026-01-01"),
      path: "x.md" as VaultPath,
      typeName: "Standup",
      typeId: TYPE_ID,
      counter: 3,
    });

    expect(harness.resolve(NoteletPathService).nextIndex("daily", anchor("2026-01-01"), "Standup")).toBe(4);
  });

  it("restarts notelet_index each period", async () => {
    const harness = await harnessWith({ nameTemplate: "Standup {{notelet_index}}" });
    harness.resolve(JournalsIndex).register({
      kind: "notelet",
      journalName: "daily",
      anchor: anchor("2026-01-01"),
      path: "x.md" as VaultPath,
      typeName: "Standup",
      typeId: TYPE_ID,
      counter: 3,
    });

    expect(harness.resolve(NoteletPathService).nextIndex("daily", anchor("2026-01-02"), "Standup")).toBe(1);
  });

  it("ignores another type's counters in the same period", async () => {
    const harness = await harnessWith({ nameTemplate: "Standup {{notelet_index}}" });
    harness.resolve(JournalsIndex).register({
      kind: "notelet",
      journalName: "daily",
      anchor: anchor("2026-01-01"),
      path: "x.md" as VaultPath,
      typeName: "Meeting",
      typeId: null,
      counter: 9,
    });

    expect(harness.resolve(NoteletPathService).nextIndex("daily", anchor("2026-01-01"), "Standup")).toBe(1);
  });

  it("suffixes a taken path with the smallest free integer", async () => {
    const harness = await harnessWith({ nameTemplate: "Standup" });
    harness.host.putFile("Standup.md", "");
    harness.host.putFile("Standup 1.md", "");
    const config = unwrap(harness.resolve(JournalsRepository).get("daily"));
    const type = config.notelets.nt_1;
    assert(type !== undefined);

    const path = harness.resolve(NoteletPathService).availablePathFor(config, type, meta());

    expect(path.isOk() && path.value).toBe("Standup 2.md");
  });

  it("reserves the journal's derived period-note path even when no file is there", async () => {
    const harness = await harnessWith({ nameTemplate: "{{date:YYYY-MM-DD}}" });
    const config = unwrap(harness.resolve(JournalsRepository).get("daily"));
    const type = config.notelets.nt_1;
    assert(type !== undefined);

    const path = harness.resolve(NoteletPathService).availablePathFor(config, type, meta());

    expect(path.isOk() && path.value).toBe("2026-01-01 1.md");
  });

  it("rejects a name template that renders empty", async () => {
    const harness = await harnessWith({ nameTemplate: "  " });
    const config = unwrap(harness.resolve(JournalsRepository).get("daily"));
    const type = config.notelets.nt_1;
    assert(type !== undefined);

    const path = harness.resolve(NoteletPathService).availablePathFor(config, type, meta());

    expect(path.isErr()).toBe(true);
  });

  describe("nameFor", () => {
    it("renders the same name availablePathFor derives its base name from", async () => {
      const harness = await harnessWith({ nameTemplate: "Standup {{date:YYYY-MM-DD}}" });
      const config = unwrap(harness.resolve(JournalsRepository).get("daily"));
      const type = config.notelets.nt_1;
      assert(type !== undefined);

      const name = harness.resolve(NoteletPathService).nameFor(config, type, meta());

      expect(name.isOk() && name.value).toBe("Standup 2026-01-01");
    });

    it("rejects a name template that renders empty", async () => {
      const harness = await harnessWith({ nameTemplate: "  " });
      const config = unwrap(harness.resolve(JournalsRepository).get("daily"));
      const type = config.notelets.nt_1;
      assert(type !== undefined);

      const name = harness.resolve(NoteletPathService).nameFor(config, type, meta());

      expect(name.isErr()).toBe(true);
    });
  });

  describe("pathFor", () => {
    it("renders the type's folder and name template", async () => {
      const harness = await harnessWith({ folder: "Notelets", nameTemplate: "Standup {{notelet_index}}" });
      const config = unwrap(harness.resolve(JournalsRepository).get("daily"));
      const type = config.notelets.nt_1;
      assert(type !== undefined);

      const path = harness.resolve(NoteletPathService).pathFor(config, type, meta({ counter: 1 }));

      expect(path.isOk() && path.value).toBe("Notelets/Standup 1.md");
    });

    // availablePathFor suffixes past a taken path; the rename half of connect must not, or it
    // offers the user a name it is not going to write.
    it("does not step past a file already at that path", async () => {
      const harness = await harnessWith({ nameTemplate: "Standup {{notelet_index}}" });
      harness.host.putFile("Standup 1.md", "taken");
      const config = unwrap(harness.resolve(JournalsRepository).get("daily"));
      const type = config.notelets.nt_1;
      assert(type !== undefined);
      const metadata = meta({ counter: 1 });

      const path = harness.resolve(NoteletPathService).pathFor(config, type, metadata);
      const available = harness.resolve(NoteletPathService).availablePathFor(config, type, metadata);

      expect(path.isOk() && path.value).toBe("Standup 1.md");
      expect(available.isOk() && available.value).toBe("Standup 1 1.md");
    });

    it("rejects a name template that renders empty", async () => {
      const harness = await harnessWith({ nameTemplate: "  " });
      const config = unwrap(harness.resolve(JournalsRepository).get("daily"));
      const type = config.notelets.nt_1;
      assert(type !== undefined);

      const path = harness.resolve(NoteletPathService).pathFor(config, type, meta());

      expect(path.isErr()).toBe(true);
    });
  });
});
