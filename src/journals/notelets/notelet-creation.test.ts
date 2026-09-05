import { describe, expect, it, vi } from "vitest";

import type { AnchorString } from "@/calendar";
import { FrontmatterError, NotesService } from "@/infrastructure/host";
import type { VaultPath } from "@/infrastructure/host";
import { AsyncResult } from "@/infrastructure/result";
import { expectOk } from "@/infrastructure/result/testing";
import { testContainer, type TestContainerOptions, type TestHarness } from "@/testing";

import { JournalsIndex } from "../journals-index";
import { journalsCoreModule } from "../module";
import { buildNoteletType, fixedJournal } from "../testing";
import { VaultSubscriptionService } from "../vault-subscription";

import { NoteletCreationService } from "./notelet-creation";

import type { NoteletType, TypeId } from "./config";
import type { JournalConfig } from "../config";
import type { Prompt, PromptAnswer } from "../prompts/config";

const ANCHOR = "2026-08-30" as AnchorString;
const TYPE = "nt_7f3a" as TypeId;

function workWith(overrides: Partial<NoteletType> = {}): { journals: Record<string, JournalConfig> } {
  return {
    journals: {
      Work: fixedJournal(
        "Work",
        { type: "day" },
        {
          notelets: {
            [TYPE]: buildNoteletType({
              id: TYPE,
              name: "Standup",
              nameTemplate: "Standup {{notelet_index}}",
              ...overrides,
            }),
          },
        },
      ),
    },
  };
}

// `journalsCoreModule` alone never boots `VaultSubscriptionService`, so `JournalsIndex.whenReady()`
// hangs forever and a second notelet's counter never sees the first one's write. Initializing it
// here is what makes the created note's frontmatter reach the index the same way it does at
// runtime, so `nextIndex` reads it back rather than an index frozen at empty.
async function boot(data: TestContainerOptions["data"]): Promise<TestHarness> {
  return testContainer({ modules: [journalsCoreModule], data, initialize: [VaultSubscriptionService] });
}

describe("NoteletCreationService", () => {
  it("creates the notelet at its rendered name", async () => {
    const harness = await boot(workWith());

    const created = await harness.resolve(NoteletCreationService).createNotelet("Work", TYPE, ANCHOR);

    expectOk(created);
    expect(created.value.path).toBe("Standup 1.md");
  });

  it("writes the journal claim, the anchor and the type name", async () => {
    const harness = await boot(workWith());

    const created = await harness.resolve(NoteletCreationService).createNotelet("Work", TYPE, ANCHOR);

    expectOk(created);
    expect(harness.host.files.get(created.value.path)?.frontmatter).toMatchObject({
      journal: "Work",
      "journal-date": ANCHOR,
      "journal-notelet": "Standup",
      "journal-notelet-index": 1,
    });
  });

  it("suffixes the second notelet of the period past the first", async () => {
    const harness = await boot(workWith());
    const service = harness.resolve(NoteletCreationService);

    const first = await service.createNotelet("Work", TYPE, ANCHOR);
    expectOk(first);
    // Nothing in this fake host's `updateFrontmatter` fires the metadataCache "changed" event
    // `VaultSubscriptionService` listens on — real Obsidian does, on its own timer, but a second
    // creation in the same tick cannot wait on it. Emitting it here is what lets the second
    // call's `nextIndex` see the first note's counter rather than an index frozen at empty.
    harness.host.emitMetadata(first.value.path);
    const second = await service.createNotelet("Work", TYPE, ANCHOR);

    expectOk(second);
    expect(second.value.path).toBe("Standup 2.md");
  });

  it("refuses a type the journal does not own", async () => {
    const harness = await boot(workWith());

    const created = await harness.resolve(NoteletCreationService).createNotelet("Work", "nt_gone" as TypeId, ANCHOR);

    expect(created.isErr()).toBe(true);
  });

  it("refuses a period outside the journal's timeline", async () => {
    const harness = await boot({
      journals: {
        Work: fixedJournal(
          "Work",
          { type: "day" },
          {
            timeline: { start: "2026-09-01" as AnchorString, end: { kind: "never" } },
            notelets: { [TYPE]: buildNoteletType({ id: TYPE, name: "Standup" }) },
          },
        ),
      },
    });

    const created = await harness.resolve(NoteletCreationService).createNotelet("Work", TYPE, ANCHOR);

    expect(created.isErr()).toBe(true);
  });

  it("applies the type's content templates, not the journal's", async () => {
    const harness = await boot(workWith({ templates: ["Templates/Standup"] }));
    harness.host.putFile("Templates/Standup.md", "# Standup");

    const created = await harness.resolve(NoteletCreationService).createNotelet("Work", TYPE, ANCHOR);

    expectOk(created);
    expect(harness.host.files.get(created.value.path)?.content).toContain("# Standup");
  });

  it("does not take the journal's own derived period path", async () => {
    const harness = await boot({
      journals: {
        Work: fixedJournal(
          "Work",
          { type: "day" },
          {
            nameTemplate: "Standup 1",
            notelets: {
              [TYPE]: buildNoteletType({ id: TYPE, name: "Standup", nameTemplate: "Standup {{notelet_index}}" }),
            },
          },
        ),
      },
    });

    const created = await harness.resolve(NoteletCreationService).createNotelet("Work", TYPE, ANCHOR);

    expectOk(created);
    // Suffixing appends to the whole rendered base, and the counter was already assigned — so the
    // collision produces "Standup 1 1", not a bumped "Standup 2".
    expect(created.value.path).toBe("Standup 1 1.md");
  });

  it("assigns no counter when the type's counter is off", async () => {
    const harness = await boot(
      workWith({ counter: { enabled: false, frontmatterKey: "journal-notelet-index" }, nameTemplate: "Standup" }),
    );

    const created = await harness.resolve(NoteletCreationService).createNotelet("Work", TYPE, ANCHOR);

    expectOk(created);
    expect(harness.host.files.get(created.value.path)?.frontmatter).not.toHaveProperty("journal-notelet-index");
  });

  it("reports the counter it assigned", async () => {
    const harness = await boot(workWith());

    const created = await harness.resolve(NoteletCreationService).createNotelet("Work", TYPE, ANCHOR);

    expectOk(created);
    expect(created.value).toMatchObject({ counter: 1 });
  });

  it("reports no counter when the type has none", async () => {
    const harness = await boot(workWith({ counter: { enabled: false, frontmatterKey: "journal-notelet-index" } }));

    const created = await harness.resolve(NoteletCreationService).createNotelet("Work", TYPE, ANCHOR);

    expectOk(created);
    expect(created.value.counter).toBeUndefined();
  });

  it("refuses unattended creation when a question reaches the note name", async () => {
    const harness = await boot(
      workWith({
        nameTemplate: "Standup {{attendee}}",
        prompts: [
          { type: "text", variable: "attendee", question: "Who with?", frontmatterKey: "with", required: false },
        ],
      }),
    );

    const created = await harness
      .resolve(NoteletCreationService)
      .createNotelet("Work", TYPE, ANCHOR, { unattended: true });

    expect(created.isErr()).toBe(true);
  });
});

async function answering(harness: TestHarness, answers: Record<string, PromptAnswer>): Promise<void> {
  await vi.waitFor(() => {
    expect(harness.modals.opens).toHaveLength(1);
  });
  harness.modals.lastOpen<unknown, Record<string, PromptAnswer>>().submit(answers);
}

describe("NoteletCreationService — a question the note name spells", () => {
  const attendee: Prompt = {
    type: "text",
    variable: "attendee",
    question: "Who with?",
    frontmatterKey: "standup-with",
    required: false,
  };

  // The whole slice is built around this order: questions run before the name renders, because
  // an answer can reach the filename and a placeholder must never be persisted into one.
  it("renders the answer into the path it creates", async () => {
    const harness = await boot(workWith({ nameTemplate: "Standup {{attendee}}", prompts: [attendee] }));

    const promise = harness.resolve(NoteletCreationService).createNotelet("Work", TYPE, ANCHOR);
    await answering(harness, { attendee: "Dana" });
    const created = await promise;

    expectOk(created);
    expect(created.value.path).toBe("Standup Dana.md");
  });

  it("stores the answer under its own property on the created note", async () => {
    const harness = await boot(workWith({ nameTemplate: "Standup {{attendee}}", prompts: [attendee] }));

    const promise = harness.resolve(NoteletCreationService).createNotelet("Work", TYPE, ANCHOR);
    await answering(harness, { attendee: "Dana" });
    const created = await promise;

    expectOk(created);
    expect(harness.host.files.get(created.value.path)?.frontmatter).toMatchObject({ "standup-with": "Dana" });
  });

  it("creates nothing when the questions are cancelled", async () => {
    const harness = await boot(workWith({ nameTemplate: "Standup {{attendee}}", prompts: [attendee] }));

    const promise = harness.resolve(NoteletCreationService).createNotelet("Work", TYPE, ANCHOR);
    await vi.waitFor(() => {
      expect(harness.modals.opens).toHaveLength(1);
    });
    harness.modals.lastOpen().cancel();
    const created = await promise;

    expect(created.isErr()).toBe(true);
    expect(harness.host.files.get("Standup Dana.md")).toBeUndefined();
  });
});

describe("attachNotelet", () => {
  it("writes the notelet claim onto an existing note", async () => {
    const harness = await boot(workWith());
    harness.host.putFile("inbox/n.md", "my own words");

    const attached = await harness.resolve(NoteletCreationService).attachNotelet("Work", "inbox/n.md" as VaultPath, {
      kind: "notelet",
      journalName: "Work",
      anchor: ANCHOR,
      typeId: TYPE,
      counter: 3,
    });

    expectOk(attached);
    expect(harness.host.files.get("inbox/n.md")?.frontmatter).toEqual({
      journal: "Work",
      "journal-date": ANCHOR,
      "journal-notelet": "Standup",
      "journal-notelet-index": 3,
    });
  });

  it("leaves a note that already has content alone", async () => {
    const harness = await boot(workWith({ templates: ["Templates/Standup"] }));
    harness.host.putFile("Templates/Standup.md", "# Standup");
    harness.host.putFile("inbox/n.md", "my own words");

    await harness.resolve(NoteletCreationService).attachNotelet("Work", "inbox/n.md" as VaultPath, {
      kind: "notelet",
      journalName: "Work",
      anchor: ANCHOR,
      typeId: TYPE,
    });

    expect(harness.host.files.get("inbox/n.md")?.content).toBe("my own words");
  });

  it("renders the type's templates into an empty note even though attaching frontmatter fills the file body", async () => {
    const harness = await boot(workWith({ templates: ["Templates/Standup"] }));
    harness.host.putFile("Templates/Standup.md", "# Standup");
    harness.host.putFile("inbox/n.md", "");
    // The fake host keeps `content` and `frontmatter` as separate fields, so it never models
    // Obsidian's real processFrontMatter embedding a `---` block into the file text. Simulate
    // that coupling here, matching NoteCreationService.attachNote's equivalent test, so emptiness
    // is provably judged against the note's original body rather than its post-frontmatter one.
    const notes = harness.resolve(NotesService);
    vi.spyOn(notes, "updateFrontmatter").mockImplementation((path) =>
      AsyncResult.fromPromise(
        (async () => {
          const current = await notes.read(path);
          const body = current.isOk() ? current.value : "";
          await notes.write(path, `---\njournal: Work\n---\n${body}`);
        })(),
        () => new FrontmatterError(path, new Error("unreachable")),
      ),
    );

    await harness.resolve(NoteletCreationService).attachNotelet("Work", "inbox/n.md" as VaultPath, {
      kind: "notelet",
      journalName: "Work",
      anchor: ANCHOR,
      typeId: TYPE,
    });

    expect(harness.host.files.get("inbox/n.md")?.content).toContain("# Standup");
  });

  // Several notelets per anchor is the design. attachNote refuses an occupied anchor; this must
  // not inherit that, or the second notelet of a day can never be connected.
  it("attaches a second notelet onto an anchor a period note already holds", async () => {
    const harness = await boot(workWith());
    harness.host.putFile("Journal/period.md", "period", { journal: "Work", "journal-date": ANCHOR });
    harness.resolve(JournalsIndex).register({
      journalName: "Work",
      anchor: ANCHOR,
      path: "Journal/period.md" as VaultPath,
    });
    harness.host.putFile("inbox/n.md", "note");

    const attached = await harness.resolve(NoteletCreationService).attachNotelet("Work", "inbox/n.md" as VaultPath, {
      kind: "notelet",
      journalName: "Work",
      anchor: ANCHOR,
      typeId: TYPE,
    });

    expectOk(attached);
  });

  it("refuses a type the journal does not have", async () => {
    const harness = await boot(workWith());
    harness.host.putFile("inbox/n.md", "note");

    const attached = await harness.resolve(NoteletCreationService).attachNotelet("Work", "inbox/n.md" as VaultPath, {
      kind: "notelet",
      journalName: "Work",
      anchor: ANCHOR,
      typeId: "nt_missing" as TypeId,
    });

    expect(attached.isErr()).toBe(true);
  });
});

describe("the slice end to end", () => {
  it("indexes the created notelet under both lookups", async () => {
    const harness = await boot(workWith());

    const created = await harness.resolve(NoteletCreationService).createNotelet("Work", TYPE, ANCHOR);
    expectOk(created);
    harness.host.emitMetadata(created.value.path);

    const index = harness.resolve(JournalsIndex);
    expect(index.noteletsAt("Work", ANCHOR).map((entry) => entry.path)).toContain(created.value.path);
    expect(index.noteletsOfType("Work", "Standup").map((entry) => entry.path)).toContain(created.value.path);
  });

  it("keeps the notelet out of the period lookups", async () => {
    const harness = await boot(workWith());

    const created = await harness.resolve(NoteletCreationService).createNotelet("Work", TYPE, ANCHOR);
    expectOk(created);
    harness.host.emitMetadata(created.value.path);

    expect(harness.resolve(JournalsIndex).entryByAnchor("Work", ANCHOR).isNone()).toBe(true);
  });
});
