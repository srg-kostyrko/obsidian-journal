import userEvent from "@testing-library/user-event";
import { screen, waitFor, within } from "@testing-library/vue";
import { describe, expect, it, vi } from "vitest";

import { localMoment } from "@/calendar";
import { anchor } from "@/calendar/testing";
import { m } from "@/i18n";
import { PluginDataIOError } from "@/infrastructure/host";
import type { VaultPath } from "@/infrastructure/host";
import { AsyncResult } from "@/infrastructure/result";
import { JournalsIndex } from "@/journals/journals-index";
import { journalsCoreModule } from "@/journals/module";
import { CURRENT_VERSION } from "@/settings";
import { legacyMigrationsModule, pendingNoteMigrationSlice } from "@/settings/legacy";
import { testContainer, type TestHarness } from "@/testing";

import { maintenanceCoreModule } from "../module";
import { RepairService } from "../repair-service";
import { ScanService } from "../scan-service";
import { maintenanceUiModule } from "../ui-module";

import MaintenanceSubpage from "./MaintenanceSubpage.vue";

import type { RepairAction, ScanReport } from "../findings";
import type { RepairLogEntry } from "../repair-service";

function flushPromises(): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, 0));
}

const EMPTY_REPORT: ScanReport = { findings: [], analyzed: 0, unreadable: [], unparsed: 0, pendingMigration: false };

interface StubOptions {
  files?: Record<string, string>;
  scan?: ScanReport;
  scanFn?: () => Promise<ScanReport>;
  apply?: (actions: readonly RepairAction[]) => AsyncResult<RepairLogEntry[], never>;
}

async function setup(stubs: StubOptions = {}): Promise<TestHarness> {
  const harness = await testContainer({
    modules: [journalsCoreModule, maintenanceCoreModule, maintenanceUiModule, legacyMigrationsModule],
    data: { journals: {}, [pendingNoteMigrationSlice.key]: [] },
  });
  const files = Object.entries(stubs.files ?? {});
  for (const [name, contents] of files) harness.data.files.set(name, contents);
  // A ready-by-default index: the maintenance page's own "still indexing" state is exercised at
  // the JournalsIndex level (journals-index.test.ts); these fixtures only need scans to settle
  // promptly so they aren't about proving that behavior.
  harness.resolve(JournalsIndex).markReady();
  vi.spyOn(harness.resolve(ScanService), "scan").mockImplementation(
    stubs.scanFn ?? (() => Promise.resolve(stubs.scan ?? EMPTY_REPORT)),
  );
  vi.spyOn(harness.resolve(RepairService), "apply").mockImplementation(stubs.apply ?? (() => AsyncResult.ok([])));
  return harness;
}

function makeNav() {
  return { back: vi.fn(), push: vi.fn(), replace: vi.fn() };
}

function mount(harness: TestHarness, nav = makeNav()) {
  return { ...harness.render(MaintenanceSubpage, { props: { nav } }), nav };
}

function row(label: string): HTMLElement {
  const heading = screen.getByText(label);
  const found = heading.closest(".setting-item");
  if (!found) throw new Error(`row not found for label: ${label}`);
  return found as HTMLElement;
}

// Bridges the DOM the component actually renders to the wrapper.text()/findAll() shape a
// component test naturally wants, without pulling in a second test-rendering library. Also
// hands back the raw DOM root for tests that need to target one row among several identical
// ones (e.g. two "Keep this one" buttons that read the same but belong to different findings).
async function mountSubpage(stubs: StubOptions = {}) {
  const harness = await setup(stubs);
  const { container: root } = mount(harness);

  const wrapper = {
    text: () => root.textContent ?? "",
    findAll: (selector: string) =>
      [...root.querySelectorAll(selector)].map((element) => ({
        text: () => element.textContent ?? "",
        trigger: (_event: string) => userEvent.click(element),
      })),
  };

  return { wrapper, dom: root };
}

describe("MaintenanceSubpage", () => {
  it("lists a snapshot with the version it was taken before", async () => {
    const harness = await setup({ files: { "backup-v3-2026-08-16T10-20-30.json": '{"version":3}' } });

    mount(harness);

    expect(await screen.findByText(m.maintenance_snapshot_row({ version: 3 }))).toBeTruthy();
  });

  it("says so when there are no snapshots", async () => {
    const harness = await setup();

    mount(harness);

    expect(await screen.findByText(m.maintenance_snapshots_empty())).toBeTruthy();
  });

  it("shows a distinct error state, not the empty state, when snapshots cannot be listed", async () => {
    const harness = await setup();
    vi.spyOn(harness.data, "listFiles").mockReturnValueOnce(
      AsyncResult.err(new PluginDataIOError("list", new Error("permission denied"))),
    );

    mount(harness);

    expect(await screen.findByText(m.maintenance_snapshots_load_failed())).toBeTruthy();
    expect(screen.queryByText(m.maintenance_snapshots_empty())).toBeNull();
  });

  it("calls nav.back when the back breadcrumb is clicked", async () => {
    const harness = await setup();
    const { nav } = mount(harness);

    await userEvent.click(screen.getByRole("button", { name: m.common_label_back() }));

    expect(nav.back).toHaveBeenCalled();
  });

  it("restores settings and shows a notice when Restore is clicked", async () => {
    const harness = await setup({
      files: { "backup-v3-2026-08-16T10-20-30.json": JSON.stringify({ version: CURRENT_VERSION, journals: {} }) },
    });
    mount(harness);
    await screen.findByText(m.maintenance_snapshot_row({ version: 3 }));

    await userEvent.click(
      within(row("2026-08-16T10:20:30Z")).getByRole("button", { name: m.maintenance_snapshot_restore() }),
    );

    expect(harness.notices.messages).toContain(m.maintenance_snapshot_restored({ takenAt: "2026-08-16T10:20:30Z" }));
  });

  it("shows a failure notice when the snapshot cannot be read", async () => {
    const harness = await setup({ files: { "backup-v3-2026-08-16T10-20-30.json": "not json" } });
    mount(harness);
    await screen.findByText(m.maintenance_snapshot_row({ version: 3 }));

    await userEvent.click(
      within(row("2026-08-16T10:20:30Z")).getByRole("button", { name: m.maintenance_snapshot_restore() }),
    );

    expect(harness.notices.messages).toContain(m.maintenance_snapshot_failed());
  });

  it("shows a failure notice when the snapshot reads fine but cannot be applied", async () => {
    const harness = await setup({
      files: { "backup-v3-2026-08-16T10-20-30.json": JSON.stringify({ version: CURRENT_VERSION, journals: {} }) },
    });
    vi.spyOn(harness.data, "save").mockReturnValueOnce(
      AsyncResult.err(new PluginDataIOError("save", new Error("disk full"))),
    );
    mount(harness);
    await screen.findByText(m.maintenance_snapshot_row({ version: 3 }));

    await userEvent.click(
      within(row("2026-08-16T10:20:30Z")).getByRole("button", { name: m.maintenance_snapshot_restore() }),
    );

    expect(harness.notices.messages).toContain(m.maintenance_snapshot_failed());
  });

  it("disables the Restore button while a restore is in flight", async () => {
    const harness = await setup({
      files: { "backup-v3-2026-08-16T10-20-30.json": JSON.stringify({ version: CURRENT_VERSION, journals: {} }) },
    });
    const { promise: gate, resolve: releaseRead } = Promise.withResolvers<void>();
    const content = harness.data.files.get("backup-v3-2026-08-16T10-20-30.json") ?? "";
    vi.spyOn(harness.data, "readFile").mockReturnValueOnce(
      AsyncResult.fromPromise(
        gate.then(() => content),
        () => new PluginDataIOError("read-file", new Error("unused")),
      ),
    );
    mount(harness);
    await screen.findByText(m.maintenance_snapshot_row({ version: 3 }));

    const restoreButton = within(row("2026-08-16T10:20:30Z")).getByRole<HTMLButtonElement>("button", {
      name: m.maintenance_snapshot_restore(),
    });
    await userEvent.click(restoreButton);

    await waitFor(() => expect(restoreButton.disabled).toBe(true));

    releaseRead();

    await waitFor(() => expect(restoreButton.disabled).toBe(false));
  });

  it("discards displayed findings and re-scans after a successful restore", async () => {
    const staleReport: ScanReport = {
      findings: [
        {
          check: "stale-range",
          path: "stale.md" as VaultPath,
          journalName: "weekly",
          detail: { kind: "zero-length-range", anchor: anchor("2026-01-12") },
          repair: { kind: "rewrite", anchor: anchor("2026-01-12") },
        },
      ],
      analyzed: 1,
      unreadable: [],
      unparsed: 0,
      pendingMigration: false,
    };
    const scan = vi
      .fn<() => Promise<ScanReport>>()
      .mockResolvedValueOnce(staleReport)
      .mockResolvedValueOnce(EMPTY_REPORT);

    const harness = await setup({
      files: { "backup-v3-2026-08-16T10-20-30.json": JSON.stringify({ version: CURRENT_VERSION, journals: {} }) },
      scanFn: scan,
    });
    mount(harness);
    await screen.findByText(m.maintenance_check_group_stale({ journal: "weekly" }));
    expect(scan).toHaveBeenCalledTimes(1);

    await userEvent.click(
      within(row("2026-08-16T10:20:30Z")).getByRole("button", { name: m.maintenance_snapshot_restore() }),
    );

    await waitFor(() => expect(scan).toHaveBeenCalledTimes(2));
    await waitFor(() => {
      expect(screen.queryByText(m.maintenance_check_group_stale({ journal: "weekly" }))).toBeNull();
    });
    expect(screen.getByText(m.maintenance_check_clean())).toBeTruthy();
  });

  it("shows the completeness line even when nothing is wrong", async () => {
    const { wrapper } = await mountSubpage({
      scan: { findings: [], analyzed: 12, unreadable: [], unparsed: 0, pendingMigration: false },
    });
    await flushPromises();

    expect(wrapper.text()).toContain(m.maintenance_check_clean());
    expect(wrapper.text()).toContain(m.maintenance_check_completeness({ analyzed: 12, unreadable: 0, unparsed: 0 }));
  });

  it("offers no fix for a finding it cannot decide", async () => {
    const { wrapper } = await mountSubpage({
      scan: {
        findings: [
          {
            check: "rejected-anchor",
            path: "a.md" as VaultPath,
            journalName: "weekly",
            detail: { kind: "path-overrides-date", pathAnchor: anchor("2026-01-12"), dateAnchor: anchor("2026-01-19") },
            repair: { kind: "undecidable", reason: "path-and-date-disagree" },
          },
        ],
        analyzed: 1,
        unreadable: [],
        unparsed: 0,
        pendingMigration: false,
      },
    });
    await flushPromises();

    expect(wrapper.text()).toContain(m.maintenance_check_fix_all());
    expect(wrapper.findAll(".collapsible-trigger-controls button")).toHaveLength(0);
  });

  it("applies only rewrites when fixing everything safe", async () => {
    const apply = vi.fn(() => AsyncResult.ok([]));
    const { wrapper } = await mountSubpage({
      apply,
      scan: {
        findings: [
          {
            check: "rejected-anchor",
            path: "safe.md" as VaultPath,
            journalName: "weekly",
            detail: { kind: "corroborated", from: anchor("2026-01-14"), to: anchor("2026-01-12") },
            repair: { kind: "rewrite", anchor: anchor("2026-01-12") },
          },
          {
            check: "duplicate-anchor",
            path: "dup.md" as VaultPath,
            journalName: "weekly",
            detail: { kind: "duplicate", anchor: anchor("2026-01-12"), size: 1, mtime: 2 },
            repair: { kind: "undecidable", reason: "needs-choice" },
          },
        ],
        analyzed: 2,
        unreadable: [],
        unparsed: 0,
        pendingMigration: false,
      },
    });
    await flushPromises();

    await wrapper
      .findAll("button")
      .find((b) => b.text() === m.maintenance_check_fix_all())
      ?.trigger("click");

    expect(apply).toHaveBeenCalledWith([
      { path: "safe.md", journalName: "weekly", repair: { kind: "rewrite", anchor: anchor("2026-01-12") } },
    ]);
  });

  it("keeps two independent duplicate collisions in the same journal as separate groups", async () => {
    const apply = vi.fn(() => AsyncResult.ok([]));
    const { wrapper, dom } = await mountSubpage({
      apply,
      scan: {
        findings: [
          {
            check: "duplicate-anchor",
            path: "a.md" as VaultPath,
            journalName: "weekly",
            detail: { kind: "duplicate", anchor: anchor("2026-01-12"), size: 100, mtime: 10 },
            repair: { kind: "undecidable", reason: "needs-choice" },
          },
          {
            check: "duplicate-anchor",
            path: "b.md" as VaultPath,
            journalName: "weekly",
            detail: { kind: "duplicate", anchor: anchor("2026-01-12"), size: 200, mtime: 20 },
            repair: { kind: "undecidable", reason: "needs-choice" },
          },
          {
            check: "duplicate-anchor",
            path: "c.md" as VaultPath,
            journalName: "weekly",
            detail: { kind: "duplicate", anchor: anchor("2026-02-16"), size: 300, mtime: 30 },
            repair: { kind: "undecidable", reason: "needs-choice" },
          },
          {
            check: "duplicate-anchor",
            path: "d.md" as VaultPath,
            journalName: "weekly",
            detail: { kind: "duplicate", anchor: anchor("2026-02-16"), size: 400, mtime: 40 },
            repair: { kind: "undecidable", reason: "needs-choice" },
          },
        ],
        analyzed: 4,
        unreadable: [],
        unparsed: 0,
        pendingMigration: false,
      },
    });
    await flushPromises();

    // Both collisions must surface as their own heading, correctly anchored — a merged group
    // would show only one of these, and possibly with the wrong anchor in it.
    expect(wrapper.text()).toContain(
      m.maintenance_check_group_duplicate({ journal: "weekly", anchor: anchor("2026-01-12") }),
    );
    expect(wrapper.text()).toContain(
      m.maintenance_check_group_duplicate({ journal: "weekly", anchor: anchor("2026-02-16") }),
    );

    const rows = [...dom.querySelectorAll(".maintenance-finding")];
    const aRow = rows.find((element) => element.textContent?.includes("a.md"));
    const keepButton = aRow?.querySelector("button");
    if (!keepButton) throw new Error("expected a Keep this one button on a.md's row");
    await userEvent.click(keepButton);

    // Only b.md — a.md's own collision partner — may be stripped. A grouping key that ignores
    // the anchor would merge both collisions and also strip c.md and d.md, which the user never
    // touched.
    expect(apply).toHaveBeenCalledWith([{ path: "b.md", journalName: "weekly", repair: { kind: "strip-claim" } }]);
  });

  it("explains why a rewrite withdrawn by the collision gate has no Fix button", async () => {
    const { wrapper } = await mountSubpage({
      scan: {
        findings: [
          {
            check: "rejected-anchor",
            path: "a.md" as VaultPath,
            journalName: "weekly",
            detail: { kind: "corroborated", from: anchor("2026-01-14"), to: anchor("2026-01-12") },
            repair: { kind: "undecidable", reason: "anchor-contested" },
          },
        ],
        analyzed: 1,
        unreadable: [],
        unparsed: 0,
        pendingMigration: false,
      },
    });
    await flushPromises();

    expect(wrapper.text()).toContain(m.maintenance_reason_anchor_contested());
    expect(wrapper.findAll(".collapsible-trigger-controls button")).toHaveLength(0);
  });

  it("formats a duplicate's mtime instead of showing the raw epoch", async () => {
    const mtime = Date.UTC(2026, 5, 15, 8, 30);
    const { wrapper } = await mountSubpage({
      scan: {
        findings: [
          {
            check: "duplicate-anchor",
            path: "a.md" as VaultPath,
            journalName: "weekly",
            detail: { kind: "duplicate", anchor: anchor("2026-01-12"), size: 10, mtime },
            repair: { kind: "undecidable", reason: "needs-choice" },
          },
        ],
        analyzed: 1,
        unreadable: [],
        unparsed: 0,
        pendingMigration: false,
      },
    });
    await flushPromises();

    expect(wrapper.text()).not.toContain(String(mtime));
    expect(wrapper.text()).toContain(localMoment(mtime).format("YYYY-MM-DD HH:mm"));
  });

  it("disables fix everything safe when the scan could not read every note", async () => {
    const { dom } = await mountSubpage({
      scan: {
        findings: [
          {
            check: "rejected-anchor",
            path: "safe.md" as VaultPath,
            journalName: "weekly",
            detail: { kind: "corroborated", from: anchor("2026-01-14"), to: anchor("2026-01-12") },
            repair: { kind: "rewrite", anchor: anchor("2026-01-12") },
          },
        ],
        analyzed: 1,
        unreadable: [{ path: "broken.md" as VaultPath, message: "boom" }],
        unparsed: 0,
        pendingMigration: false,
      },
    });
    await flushPromises();

    const fixAll = [...dom.querySelectorAll("button")].find(
      (button) => button.textContent?.trim() === m.maintenance_check_fix_all(),
    );
    expect(fixAll?.disabled).toBe(true);
  });

  it("disables every fix action while the legacy note migration is pending", async () => {
    const { dom } = await mountSubpage({
      scan: {
        findings: [
          {
            check: "rejected-anchor",
            path: "safe.md" as VaultPath,
            journalName: "weekly",
            detail: { kind: "corroborated", from: anchor("2026-01-14"), to: anchor("2026-01-12") },
            repair: { kind: "rewrite", anchor: anchor("2026-01-12") },
          },
        ],
        analyzed: 1,
        unreadable: [],
        unparsed: 0,
        pendingMigration: true,
      },
    });
    await flushPromises();

    const fixButton = dom.querySelector<HTMLButtonElement>(".collapsible-trigger-controls button");
    const fixAll = [...dom.querySelectorAll("button")].find(
      (button) => button.textContent?.trim() === m.maintenance_check_fix_all(),
    );
    expect(fixButton?.disabled).toBe(true);
    expect(fixAll?.disabled).toBe(true);
  });
});
