import { describe, expect, it, vi } from "vitest";
import { defineComponent, h, nextTick, ref } from "vue";

import type { AnchorString } from "@/calendar";
import { NoteMetadataService, NoteStructureService, NotesService, type VaultPath } from "@/infrastructure/host";
import { FakeNoteMetadataService, FakeNoteStructureService, FakeNotesService } from "@/infrastructure/host/testing";
import { expectOk } from "@/infrastructure/result/testing";
import { JournalsIndex, JournalsRepository } from "@/journals";
import { journalsCoreModule } from "@/journals/module";
import { fixedJournal } from "@/journals/testing";
import { overrideWith, testContainer, type TestHarness } from "@/testing";

import { tasksCoreModule } from "../module";
import { NotePropertyTaskProvider } from "../providers/note-property/provider";
import { NOTE_PROPERTY_PROVIDER_ID } from "../providers/note-property/slice";
import { DEFAULT_TASK_QUERY } from "../query";
import { TaskIndex } from "../task-index";
import { TaskProviderToken } from "../types";

import { useTaskListing, type UseTaskListingResult } from "./use-task-listing";

import type { TaskListingRequest } from "../listing";
import type { TaskItem, TaskStatus } from "../types";

function taskItem(path: VaultPath, key: string, markdown: string, status: TaskStatus = "todo"): TaskItem {
  return {
    provider: "test",
    key,
    path,
    status,
    relations: ["containment"],
    capabilities: { movable: true, stampable: true, retargetable: false },
    display: { kind: "line", path, line: 0, endLine: 0, parentLine: null, markdown },
    dates: {},
  };
}

function requestFor(anchor: AnchorString): TaskListingRequest {
  return { kind: "period", hostJournal: "daily", anchor, journalNames: ["daily"], query: DEFAULT_TASK_QUERY };
}

function renderNothing() {
  return h("div");
}

function mountListing(harness: TestHarness, request: () => TaskListingRequest | null): UseTaskListingResult {
  let result: UseTaskListingResult | undefined;
  const Host = defineComponent({
    setup() {
      result = useTaskListing(request);
      return renderNothing;
    },
  });
  harness.render(Host);
  const captured = result;
  if (captured === undefined) throw new Error("useTaskListing did not run during setup");
  return captured;
}

async function buildHarness(): Promise<TestHarness> {
  return testContainer({
    modules: [journalsCoreModule, tasksCoreModule],
    data: { journals: { daily: fixedJournal("daily", { type: "day" }) } },
  });
}

describe("useTaskListing", () => {
  it("builds rows from the request, resolved against the journal and task indexes", async () => {
    const harness = await buildHarness();
    const path = "Daily/2026-09-22.md" as VaultPath;
    harness.resolve(JournalsIndex).register({ journalName: "daily", anchor: "2026-09-22" as AnchorString, path });
    harness.resolve(TaskIndex).publish("test", { path }, [taskItem(path, "t1", "- [ ] Ship it")]);

    const { rows } = mountListing(harness, () => requestFor("2026-09-22" as AnchorString));

    await vi.waitFor(() => expect(rows.value).toHaveLength(1));
    expect(rows.value.at(0)?.item.key).toBe("t1");
  });

  it("builds no rows and stays not-pending when the request is null", async () => {
    const harness = await buildHarness();
    const { rows, pending } = mountListing(harness, () => null);
    await nextTick();

    expect(rows.value).toEqual([]);
    expect(pending.value).toBe(false);
  });

  it("rebuilds when the task index changes even though the request has not, via useTasksVersion", async () => {
    const harness = await buildHarness();
    const path = "Daily/2026-09-22.md" as VaultPath;
    harness.resolve(JournalsIndex).register({ journalName: "daily", anchor: "2026-09-22" as AnchorString, path });

    const { rows } = mountListing(harness, () => requestFor("2026-09-22" as AnchorString));
    await vi.waitFor(() => expect(rows.value).toHaveLength(0));

    harness.resolve(TaskIndex).publish("test", { path }, [taskItem(path, "t1", "- [ ] Ship it")]);

    await vi.waitFor(() => expect(rows.value).toHaveLength(1));
  });

  // A journal's listing filter is settings, not index state, so neither version ref sees it change.
  // The request object is deliberately the same reference on every read: a getter handing back a
  // fresh object would make the watcher fire on reference churn alone and pass with no trigger at
  // all.
  it("rebuilds when the owning journal's listing filter changes", async () => {
    const harness = await buildHarness();
    const path = "Daily/2026-09-22.md" as VaultPath;
    harness.resolve(JournalsIndex).register({ journalName: "daily", anchor: "2026-09-22" as AnchorString, path });
    harness
      .resolve(TaskIndex)
      .publish("test", { path }, [
        taskItem(path, "open", "- [ ] Ship it"),
        taskItem(path, "finished", "- [x] Buy milk", "done"),
      ]);

    // Names no status, so the journal's own condition is what decides which rows survive.
    const bare: TaskListingRequest = {
      ...requestFor("2026-09-22" as AnchorString),
      query: { ...DEFAULT_TASK_QUERY, filter: { mode: "and", conditions: [] } },
    };
    const { rows } = mountListing(harness, () => bare);
    await vi.waitFor(() => expect(rows.value.map((row) => row.item.key)).toEqual(["open"]));

    const journals = harness.resolve(JournalsRepository);
    const stored = journals.require("daily");
    expectOk(stored);
    const written = journals.update("daily", {
      tasks: {
        ...stored.value.tasks,
        filter: { mode: "and", conditions: [{ type: "status", condition: "is", statuses: ["all"] }] },
      },
    });
    expectOk(written);

    await vi.waitFor(() => expect(rows.value.map((row) => row.item.key)).toEqual(["open", "finished"]));
  });

  it(
    "keeps the previous rows while a rebuild is pending, and a slower earlier build cannot " +
      "overwrite the result of a newer one that finished first",
    async () => {
      const harness = await buildHarness();
      const oldPath = "Daily/2026-09-22.md" as VaultPath;
      const middlePath = "Daily/2026-09-23.md" as VaultPath;
      const newPath = "Daily/2026-09-24.md" as VaultPath;
      const index = harness.resolve(JournalsIndex);
      index.register({ journalName: "daily", anchor: "2026-09-22" as AnchorString, path: oldPath });
      index.register({ journalName: "daily", anchor: "2026-09-23" as AnchorString, path: middlePath });
      index.register({ journalName: "daily", anchor: "2026-09-24" as AnchorString, path: newPath });
      const tasks = harness.resolve(TaskIndex);
      tasks.publish("test", { path: oldPath }, [taskItem(oldPath, "old", "- [ ] Old")]);
      tasks.publish("test", { path: middlePath }, [taskItem(middlePath, "middle", "- [ ] Middle")]);
      tasks.publish("test", { path: newPath }, [taskItem(newPath, "new", "- [ ] New")]);

      const request = ref<TaskListingRequest | null>(requestFor("2026-09-22" as AnchorString));
      const { rows, pending } = mountListing(harness, () => request.value);
      await vi.waitFor(() => expect(rows.value).toHaveLength(1));
      expect(rows.value.at(0)?.item.key).toBe("old");

      // Delay exactly the next hydrate call (the "middle" build) so it is still in flight when a
      // later, faster build for "new" starts and finishes ahead of it.
      const originalHydrate = tasks.hydrate.bind(tasks);
      let hydrateCalls = 0;
      let releaseMiddle: (() => void) | undefined;
      vi.spyOn(tasks, "hydrate").mockImplementation((items) => {
        hydrateCalls++;
        if (hydrateCalls === 1) {
          return new Promise((resolve) => {
            releaseMiddle = () => resolve(originalHydrate(items));
          });
        }
        return originalHydrate(items);
      });

      request.value = requestFor("2026-09-23" as AnchorString);
      await nextTick();
      // The middle build's hydrate call is now hanging — rows must not have been cleared while it
      // is in flight, and pending must reflect that a build is running.
      expect(rows.value.at(0)?.item.key).toBe("old");
      expect(pending.value).toBe(true);

      request.value = requestFor("2026-09-24" as AnchorString);
      await vi.waitFor(() => expect(rows.value.at(0)?.item.key).toBe("new"));
      expect(pending.value).toBe(false);

      releaseMiddle?.();
      await nextTick();
      await nextTick();

      expect(rows.value.at(0)?.item.key).toBe("new");
    },
  );

  // A tag filter reads a task note's tags at query time; only a version bump rebuilds the listing,
  // so the tag edit itself has to change what the provider publishes.
  it("lists a task note under a tag filter once its frontmatter gains the tag, with no other trigger", async () => {
    const notes = new FakeNotesService();
    const metadata = new FakeNoteMetadataService();
    const structures = new FakeNoteStructureService();
    const harness = await testContainer({
      modules: [journalsCoreModule, tasksCoreModule],
      data: {
        journals: { daily: fixedJournal("daily", { type: "day" }) },
        tasksNoteProperty: { enabled: true },
      },
      overrides: [
        overrideWith(NotesService, notes as never),
        overrideWith(NoteMetadataService, metadata as never),
        overrideWith(NoteStructureService, structures as never),
      ],
    });
    harness.resolve(JournalsIndex).markReady();
    const path = "Tasks/Ship it.md" as VaultPath;
    const setTags = (frontmatterTags: string[]) => {
      metadata.setMetadata(path, { title: "Ship it", tags: frontmatterTags, properties: { scheduled: "2026-09-22" } });
      structures.setStructure(path, { listItems: [], tags: [], headings: [], frontmatterTags });
    };
    notes.seed(path);
    setTags(["#task"]);
    const provider = harness.resolve(TaskProviderToken).find((candidate) => candidate.id === NOTE_PROPERTY_PROVIDER_ID);
    if (!(provider instanceof NotePropertyTaskProvider)) throw new TypeError("note-property provider not registered");
    provider.start();

    const request: TaskListingRequest = {
      ...requestFor("2026-09-22" as AnchorString),
      query: {
        ...DEFAULT_TASK_QUERY,
        filter: { mode: "and", conditions: [{ type: "tag", condition: "has", tags: ["#work"] }] },
      },
    };
    const { rows, pending } = mountListing(harness, () => request);
    await vi.waitFor(() => expect(pending.value).toBe(false));
    expect(rows.value).toEqual([]);

    setTags(["#task", "#work"]);
    notes.emitMetadataChanged(path);

    await vi.waitFor(() => expect(rows.value.map((row) => row.source.path)).toEqual([path]));
  });
});
