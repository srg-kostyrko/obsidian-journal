import { screen } from "@testing-library/vue";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { defineComponent, h, ref } from "vue";

import type { AnchorString } from "@/calendar";
import { initLocale, m } from "@/i18n";
import { MarkdownRenderService, type VaultPath } from "@/infrastructure/host";
import { FakeMarkdownRenderService } from "@/infrastructure/host/testing";
import { JournalsIndex } from "@/journals";
import { journalsCoreModule } from "@/journals/module";
import { fixedJournal } from "@/journals/testing";
import { shelvesCoreModule } from "@/shelves/module";
import { buildShelf } from "@/shelves/testing";
import { tasksCoreModule } from "@/tasks/module";
import { TaskIndex } from "@/tasks/task-index";
import { buildTaskItem } from "@/tasks/testing";
import { overrideWith, testContainer, type TestHarness } from "@/testing";

import { viewsCoreModule } from "../../../module";
import { provideViewContextStub } from "../../../testing";
import { provideViewContext, type ViewContext } from "../../../view-context";
import { tasksViewBlock, type TasksViewBlockConfig } from "../tasks-view-block";

import TasksViewBlock from "./TasksViewBlock.vue";

import type { BlockInstanceId } from "../../../config";

const BLOCK_ID = "55555555-5555-4555-8555-555555555555" as BlockInstanceId;
const DAY = "2026-09-22" as AnchorString;
const EARLIER_DAY = "2026-09-05" as AnchorString;
const MONTH_ANCHOR = "2026-09-01" as AnchorString;
const HOST = "Daily/2026-09-22.md" as VaultPath;
const EARLIER_HOST = "Daily/2026-09-05.md" as VaultPath;
const MONTH_HOST = "Monthly/2026-09.md" as VaultPath;

const daily = fixedJournal("Daily", { type: "day" });
const monthly = fixedJournal("Monthly", { type: "month" });

function seedTask(harness: TestHarness, path: VaultPath, markdown: string): void {
  harness.resolve(TaskIndex).publish("checkbox", { path }, [
    buildTaskItem({
      path,
      key: `${path}:3`,
      display: { kind: "line", path, line: 3, endLine: 3, parentLine: null, markdown },
    }),
  ]);
}

async function mountBlock(
  options: {
    config?: Partial<TasksViewBlockConfig>;
    context?: Partial<ViewContext>;
    journals?: Record<string, ReturnType<typeof fixedJournal>>;
    shelves?: Record<string, ReturnType<typeof buildShelf>>;
  } = {},
): Promise<{ harness: TestHarness }> {
  const harness = await testContainer({
    modules: [journalsCoreModule, shelvesCoreModule, tasksCoreModule, viewsCoreModule],
    data: {
      journals: options.journals ?? { Daily: daily, Monthly: monthly },
      shelves: options.shelves ?? {},
      views: {},
    },
    overrides: [
      overrideWith(MarkdownRenderService, new FakeMarkdownRenderService() as unknown as MarkdownRenderService),
    ],
  });
  const context = provideViewContextStub({ refDate: ref(DAY), ...options.context });
  const config = { ...tasksViewBlock.defaultConfig, ...options.config };
  const renderBlock = () => h(TasksViewBlock, { instanceId: BLOCK_ID, config });
  const Wrapper = defineComponent({
    setup() {
      provideViewContext(context);
      return renderBlock;
    },
  });
  harness.render(Wrapper, { props: {} });
  return { harness };
}

describe("TasksViewBlock", () => {
  beforeAll(() => initLocale("en"));

  it("shows the empty message with no matching tasks", async () => {
    await mountBlock();
    await vi.waitFor(() => expect(screen.getByText(m.tasks_listing_empty())).toBeTruthy());
  });

  it("lists a task from a journal whose period overlaps the resolved window", async () => {
    const { harness } = await mountBlock();
    harness.resolve(JournalsIndex).register({ journalName: "Daily", anchor: DAY, path: HOST });
    seedTask(harness, HOST, "- [ ] Ship it");
    await vi.waitFor(() => expect(screen.getByText("- [ ] Ship it")).toBeTruthy());
  });

  // Waits for an in-window task first: an empty listing is also the state before the async
  // rebuild has run at all, so asserting the "no match" text alone would pass on a stale render
  // that never actually reached the out-of-window day, not just on a correctly narrow one.
  it("does not reach a day outside the default day window", async () => {
    const { harness } = await mountBlock();
    harness.resolve(JournalsIndex).register({ journalName: "Daily", anchor: DAY, path: HOST });
    harness.resolve(JournalsIndex).register({ journalName: "Daily", anchor: EARLIER_DAY, path: EARLIER_HOST });
    seedTask(harness, HOST, "- [ ] Ship it");
    seedTask(harness, EARLIER_HOST, "- [ ] Earlier");
    await vi.waitFor(() => expect(screen.getByText("- [ ] Ship it")).toBeTruthy());
    expect(screen.queryByText("- [ ] Earlier")).toBeNull();
  });

  // Proves config.window actually drives the request rather than being stored and ignored.
  it("widens to a day outside the default window once the window is wider", async () => {
    const { harness } = await mountBlock({ config: { window: "month" } });
    harness.resolve(JournalsIndex).register({ journalName: "Daily", anchor: EARLIER_DAY, path: EARLIER_HOST });
    seedTask(harness, EARLIER_HOST, "- [ ] Earlier");
    await vi.waitFor(() => expect(screen.getByText("- [ ] Earlier")).toBeTruthy());
  });

  // The view has an explicit shelf selector, unlike the journal-tasks fence. Waits for the
  // in-shelf task first — asserting only the "no match" text would also pass on a stale render
  // taken before the async rebuild ran at all, which is a false pass a deleted shelf-scope
  // wiring would slip through just as easily as a correct one. Paired with the next test showing
  // the shelf-mate reappearing once included.
  it("scopes to the view's shelf, dropping a journal outside it", async () => {
    const { harness } = await mountBlock({
      shelves: { Work: buildShelf("Work", { journals: ["Daily"] }) },
      context: { shelf: ref("Work") },
    });
    harness.resolve(JournalsIndex).register({ journalName: "Daily", anchor: DAY, path: HOST });
    harness.resolve(JournalsIndex).register({ journalName: "Monthly", anchor: MONTH_ANCHOR, path: MONTH_HOST });
    seedTask(harness, HOST, "- [ ] Ship it");
    seedTask(harness, MONTH_HOST, "- [ ] Plan quarter");
    await vi.waitFor(() => expect(screen.getByText("- [ ] Ship it")).toBeTruthy());
    expect(screen.queryByText("- [ ] Plan quarter")).toBeNull();
  });

  it("shows a shelf-mate's task once the shelf includes it", async () => {
    const { harness } = await mountBlock({
      shelves: { Work: buildShelf("Work", { journals: ["Daily", "Monthly"] }) },
      context: { shelf: ref("Work") },
    });
    harness.resolve(JournalsIndex).register({ journalName: "Monthly", anchor: MONTH_ANCHOR, path: MONTH_HOST });
    seedTask(harness, MONTH_HOST, "- [ ] Plan quarter");
    await vi.waitFor(() => expect(screen.getByText("- [ ] Plan quarter")).toBeTruthy());
  });

  it("narrows further by the journals filter", async () => {
    const { harness } = await mountBlock({ config: { journals: ["Daily"] } });
    harness.resolve(JournalsIndex).register({ journalName: "Daily", anchor: DAY, path: HOST });
    harness.resolve(JournalsIndex).register({ journalName: "Monthly", anchor: MONTH_ANCHOR, path: MONTH_HOST });
    seedTask(harness, HOST, "- [ ] Ship it");
    seedTask(harness, MONTH_HOST, "- [ ] Plan quarter");
    await vi.waitFor(() => expect(screen.getByText("- [ ] Ship it")).toBeTruthy());
    expect(screen.queryByText("- [ ] Plan quarter")).toBeNull();
  });

  it("treats an empty journals filter as no filter", async () => {
    const { harness } = await mountBlock({ config: { journals: [] } });
    harness.resolve(JournalsIndex).register({ journalName: "Daily", anchor: DAY, path: HOST });
    seedTask(harness, HOST, "- [ ] Ship it");
    await vi.waitFor(() => expect(screen.getByText("- [ ] Ship it")).toBeTruthy());
  });
});
