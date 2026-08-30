import { describe, expect, it } from "vitest";

import type { AnchorString } from "@/calendar";
import { expectOk } from "@/infrastructure/result/testing";
import { testContainer, type TestContainerOptions, type TestHarness } from "@/testing";

import { JournalsIndex } from "../journals-index";
import { journalsCoreModule } from "../module";
import { buildNoteletType, fixedJournal } from "../testing";
import { VaultSubscriptionService } from "../vault-subscription";

import { NoteletCreationService } from "./notelet-creation";

import type { NoteletType, TypeId } from "./config";
import type { JournalConfig } from "../config";

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
