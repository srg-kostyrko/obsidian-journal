import { screen, waitFor } from "@testing-library/vue";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { AnchorString } from "@/calendar";
import type { VaultPath } from "@/infrastructure/host";
import { JournalsIndex } from "@/journals/journals-index";
import { journalsCoreModule } from "@/journals/module";
import { customJournal, fixedJournal } from "@/journals/testing";
import { testContainer } from "@/testing";

import SequencePreview from "./SequencePreview.vue";

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-01-05T12:00:00"));
});
afterEach(() => {
  vi.useRealTimers();
});

describe("SequencePreview", () => {
  it("renders the next five note paths for a two-digit journal", async () => {
    const harness = await testContainer({
      modules: [journalsCoreModule],
      data: {
        journals: {
          daily: customJournal("daily", "week", 2, "2026-01-05", {
            nameTemplate: "Release{{release}}Sprint{{sprint}}",
            numbering: {
              enabled: true,
              anchorDate: "2026-01-05" as AnchorString,
              allowBefore: false,
              sources: [
                {
                  variable: "release",
                  frontmatterKey: "journal-release",
                  anchorValue: 4711,
                  reset: { kind: "never" },
                },
                {
                  variable: "sprint",
                  frontmatterKey: "journal-sprint",
                  anchorValue: 1,
                  reset: { kind: "after", count: 6 },
                },
              ],
            },
          }),
        },
      },
    });
    harness.render(SequencePreview, { props: { journalName: "daily" } });

    // System time is pinned to 2026-01-05 in beforeEach, so today's period is the anchor.
    expect(await screen.findByText("Release4711Sprint1.md")).toBeTruthy();
    expect(screen.getByText("Release4711Sprint5.md")).toBeTruthy();
    expect(screen.queryByText("Release4711Sprint6.md")).toBeNull();
  });

  it("renders a numbering digit that only the folder template uses", async () => {
    const harness = await testContainer({
      modules: [journalsCoreModule],
      data: {
        journals: {
          daily: customJournal("daily", "week", 2, "2026-01-05", {
            folder: "Releases/R{{release}}",
            nameTemplate: "Sprint{{sprint}}",
            numbering: {
              enabled: true,
              anchorDate: "2026-01-05" as AnchorString,
              allowBefore: false,
              sources: [
                {
                  variable: "release",
                  frontmatterKey: "journal-release",
                  anchorValue: 4711,
                  reset: { kind: "never" },
                },
                {
                  variable: "sprint",
                  frontmatterKey: "journal-sprint",
                  anchorValue: 1,
                  reset: { kind: "after", count: 6 },
                },
              ],
            },
          }),
        },
      },
    });
    harness.render(SequencePreview, { props: { journalName: "daily" } });

    expect(await screen.findByText("Releases/R4711/Sprint1.md")).toBeTruthy();
    expect(screen.getByText("Releases/R4711/Sprint5.md")).toBeTruthy();
  });

  it("renders nothing when the name template resolves to an empty note name", async () => {
    const harness = await testContainer({
      modules: [journalsCoreModule],
      data: {
        journals: {
          daily: fixedJournal(
            "daily",
            { type: "day" },
            {
              nameTemplate: "",
              numbering: {
                enabled: true,
                anchorDate: "2026-01-05" as AnchorString,
                allowBefore: false,
                sources: [
                  { variable: "index", frontmatterKey: "journal-index", anchorValue: 1, reset: { kind: "never" } },
                ],
              },
            },
          ),
        },
      },
    });
    const { container } = harness.render(SequencePreview, { props: { journalName: "daily" } });

    await waitFor(() => {
      expect(container.querySelector(".sequence-preview")).toBeNull();
    });
  });

  it("renders nothing when numbering has no digits", async () => {
    const harness = await testContainer({
      modules: [journalsCoreModule],
      data: {
        journals: {
          daily: fixedJournal(
            "daily",
            { type: "day" },
            {
              numbering: { enabled: true, anchorDate: "" as AnchorString, allowBefore: false, sources: [] },
            },
          ),
        },
      },
    });
    const { container } = harness.render(SequencePreview, { props: { journalName: "daily" } });

    await waitFor(() => {
      expect(container.querySelector(".sequence-preview")).toBeNull();
    });
  });

  it("re-renders when the index gains a stored end date for an already-rendered anchor", async () => {
    const harness = await testContainer({
      modules: [journalsCoreModule],
      data: {
        journals: {
          daily: customJournal("daily", "week", 2, "2026-01-05", {
            nameTemplate: "Note{{end_date}}",
            numbering: {
              enabled: true,
              anchorDate: "2026-01-05" as AnchorString,
              allowBefore: false,
              sources: [
                { variable: "index", frontmatterKey: "journal-index", anchorValue: 1, reset: { kind: "never" } },
              ],
            },
          }),
        },
      },
    });
    harness.render(SequencePreview, { props: { journalName: "daily" } });

    // With no stored entry, today's period's end date is the cycle's default: two weeks
    // from the 2026-01-05 anchor, minus a day.
    expect(await screen.findByText("Note2026-01-18.md")).toBeTruthy();

    // Registering a stored end date for that same anchor is the only way JournalsIndex
    // changes without a reactive config edit — it must flow through useIndexVersion's
    // entryChanged bridge, not through Vue's own reactivity, for the preview to notice.
    harness.resolve(JournalsIndex).register({
      journalName: "daily",
      anchor: "2026-01-05" as AnchorString,
      path: "daily/2026-01-05.md" as VaultPath,
      endDate: "2026-01-10" as AnchorString,
    });

    await waitFor(() => {
      expect(screen.getByText("Note2026-01-10.md")).toBeTruthy();
    });
    expect(screen.queryByText("Note2026-01-18.md")).toBeNull();
  });

  it("does not warn about duplicate keys when the preview window crosses a carry with mostly-repeated names", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const harness = await testContainer({
      modules: [journalsCoreModule],
      data: {
        journals: {
          // A stale template — omits the fast digit — so most previewed steps render the same name.
          daily: customJournal("daily", "week", 1, "2026-01-05", {
            nameTemplate: "Release{{release}}",
            numbering: {
              enabled: true,
              anchorDate: "2026-01-05" as AnchorString,
              allowBefore: false,
              sources: [
                {
                  variable: "release",
                  frontmatterKey: "journal-release",
                  anchorValue: 4711,
                  reset: { kind: "never" },
                },
                {
                  variable: "sprint",
                  frontmatterKey: "journal-sprint",
                  anchorValue: 1,
                  reset: { kind: "after", count: 6 },
                },
              ],
            },
          }),
        },
      },
    });
    harness.render(SequencePreview, { props: { journalName: "daily" } });

    expect(await screen.findAllByText("Release4711.md")).toHaveLength(5);

    // Advance three weeks so the preview window (steps 3-7) crosses the sprint-6 carry inside
    // its unresolved middle range: Vue's head/tail quick sync matches steps 3-5 (still
    // Release4711) directly, leaving steps 6-7 (both Release4712) as the two elements Vue's
    // keyed diff must resolve together — the pair that trips the duplicate-key check. Vue only
    // runs that check during a patch, so registering an unrelated index entry forces the
    // re-render; the initial mount alone never reaches it.
    vi.setSystemTime(new Date("2026-01-26T12:00:00"));
    harness.resolve(JournalsIndex).register({
      journalName: "daily",
      anchor: "2026-01-05" as AnchorString,
      path: "daily/2026-01-05.md" as VaultPath,
      endDate: "2026-01-10" as AnchorString,
    });

    await waitFor(() => {
      expect(screen.getAllByText("Release4712.md")).toHaveLength(2);
    });
    expect(screen.getAllByText("Release4711.md")).toHaveLength(3);
    expect(warnSpy.mock.calls.some((call) => typeof call[0] === "string" && call[0].includes("Duplicate keys"))).toBe(
      false,
    );

    warnSpy.mockRestore();
  });
});
