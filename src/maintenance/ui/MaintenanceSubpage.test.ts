import userEvent from "@testing-library/user-event";
import { cleanup, render, screen, within } from "@testing-library/vue";
import { afterEach, describe, expect, it, vi } from "vitest";

import { anchor } from "@/calendar/testing";
import { m } from "@/i18n";
import { type Container, provideInjectorOnApp } from "@/infrastructure/di";
import { NoticeService, PluginDataIOError } from "@/infrastructure/host";
import type { VaultPath } from "@/infrastructure/host";
import { FakeNoticeService } from "@/infrastructure/host/testing";
import { AsyncResult } from "@/infrastructure/result";
import { CURRENT_VERSION } from "@/settings";
import { createSettingsService } from "@/settings/testing";

import { RepairService } from "../repair-service";
import { ScanService } from "../scan-service";

import MaintenanceSubpage from "./MaintenanceSubpage.vue";

import type { RepairAction, ScanReport } from "../findings";
import type { RepairLogEntry } from "../repair-service";

afterEach(() => cleanup());

function flushPromises(): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, 0));
}

const EMPTY_REPORT: ScanReport = { findings: [], analysed: 0, unreadable: [], unparsed: 0, pendingMigration: false };

function fakeScanService(report: ScanReport): ScanService {
  return { scan: () => Promise.resolve(report) } as unknown as ScanService;
}

function fakeRepairService(
  apply: (actions: readonly RepairAction[]) => AsyncResult<RepairLogEntry[], never>,
): RepairService {
  return { apply } as unknown as RepairService;
}

interface StubOptions {
  scan?: ScanReport;
  apply?: (actions: readonly RepairAction[]) => AsyncResult<RepairLogEntry[], never>;
}

async function setup(files: Record<string, string> = {}, stubs: StubOptions = {}) {
  const { service: settings, data, container } = createSettingsService({ raw: { version: CURRENT_VERSION } });
  await settings.initialize();
  for (const [name, contents] of Object.entries(files)) data.files.set(name, contents);
  const notices = new FakeNoticeService();
  container.register(NoticeService).useValue(notices);
  container.register(ScanService).useValue(fakeScanService(stubs.scan ?? EMPTY_REPORT));
  container.register(RepairService).useValue(fakeRepairService(stubs.apply ?? (() => AsyncResult.ok([]))));
  return { container, settings, data, notices };
}

function makeNav() {
  return { back: vi.fn(), push: vi.fn(), replace: vi.fn() };
}

function mount(container: Container, nav = makeNav()) {
  return {
    ...render(MaintenanceSubpage, {
      props: { nav },
      global: { plugins: [{ install: (app) => provideInjectorOnApp(app, container) }] },
    }),
    nav,
  };
}

function row(label: string): HTMLElement {
  const heading = screen.getByText(label);
  const found = heading.closest(".setting-item");
  if (!found) throw new Error(`row not found for label: ${label}`);
  return found as HTMLElement;
}

// Bridges the DOM the component actually renders to the wrapper.text()/findAll() shape a
// component test naturally wants, without pulling in a second test-rendering library.
function mountSubpage(stubs: StubOptions = {}) {
  const { container } = createSettingsService({ raw: { version: CURRENT_VERSION } });
  container.register(NoticeService).useValue(new FakeNoticeService());
  container.register(ScanService).useValue(fakeScanService(stubs.scan ?? EMPTY_REPORT));
  container.register(RepairService).useValue(fakeRepairService(stubs.apply ?? (() => AsyncResult.ok([]))));

  const { container: root } = mount(container);

  const wrapper = {
    text: () => root.textContent ?? "",
    findAll: (selector: string) =>
      [...root.querySelectorAll(selector)].map((element) => ({
        text: () => element.textContent ?? "",
        trigger: (_event: string) => userEvent.click(element),
      })),
  };

  return { wrapper };
}

describe("MaintenanceSubpage", () => {
  it("lists a snapshot with the version it was taken before", async () => {
    const { container } = await setup({ "backup-v3-2026-08-16T10-20-30.json": '{"version":3}' });

    mount(container);

    expect(await screen.findByText(m.maintenance_snapshot_row({ version: 3 }))).toBeTruthy();
  });

  it("says so when there are no snapshots", async () => {
    const { container } = await setup();

    mount(container);

    expect(await screen.findByText(m.maintenance_snapshots_empty())).toBeTruthy();
  });

  it("shows a distinct error state, not the empty state, when snapshots cannot be listed", async () => {
    const { container, data } = await setup();
    vi.spyOn(data, "listFiles").mockReturnValueOnce(
      AsyncResult.err(new PluginDataIOError("list", new Error("permission denied"))),
    );

    mount(container);

    expect(await screen.findByText(m.maintenance_snapshots_load_failed())).toBeTruthy();
    expect(screen.queryByText(m.maintenance_snapshots_empty())).toBeNull();
  });

  it("calls nav.back when the back breadcrumb is clicked", async () => {
    const { container } = await setup();
    const { nav } = mount(container);

    await userEvent.click(screen.getByRole("button", { name: m.common_label_back() }));

    expect(nav.back).toHaveBeenCalled();
  });

  it("restores settings and shows a notice when Restore is clicked", async () => {
    const { container, notices } = await setup({
      "backup-v3-2026-08-16T10-20-30.json": JSON.stringify({ version: CURRENT_VERSION, journals: {} }),
    });
    mount(container);
    await screen.findByText(m.maintenance_snapshot_row({ version: 3 }));

    await userEvent.click(
      within(row("2026-08-16T10:20:30Z")).getByRole("button", { name: m.maintenance_snapshot_restore() }),
    );

    expect(notices.messages).toContain(m.maintenance_snapshot_restored({ takenAt: "2026-08-16T10:20:30Z" }));
  });

  it("shows a failure notice when the snapshot cannot be read", async () => {
    const { container, notices } = await setup({ "backup-v3-2026-08-16T10-20-30.json": "not json" });
    mount(container);
    await screen.findByText(m.maintenance_snapshot_row({ version: 3 }));

    await userEvent.click(
      within(row("2026-08-16T10:20:30Z")).getByRole("button", { name: m.maintenance_snapshot_restore() }),
    );

    expect(notices.messages).toContain(m.maintenance_snapshot_failed());
  });

  it("shows a failure notice when the snapshot reads fine but cannot be applied", async () => {
    const { container, data, notices } = await setup({
      "backup-v3-2026-08-16T10-20-30.json": JSON.stringify({ version: CURRENT_VERSION, journals: {} }),
    });
    vi.spyOn(data, "save").mockReturnValueOnce(AsyncResult.err(new PluginDataIOError("save", new Error("disk full"))));
    mount(container);
    await screen.findByText(m.maintenance_snapshot_row({ version: 3 }));

    await userEvent.click(
      within(row("2026-08-16T10:20:30Z")).getByRole("button", { name: m.maintenance_snapshot_restore() }),
    );

    expect(notices.messages).toContain(m.maintenance_snapshot_failed());
  });

  it("shows the completeness line even when nothing is wrong", async () => {
    const { wrapper } = mountSubpage({
      scan: { findings: [], analysed: 12, unreadable: [], unparsed: 0, pendingMigration: false },
    });
    await flushPromises();

    expect(wrapper.text()).toContain(m.maintenance_check_clean());
    expect(wrapper.text()).toContain(m.maintenance_check_completeness({ analysed: 12, unreadable: 0, unparsed: 0 }));
  });

  it("offers no fix for a finding it cannot decide", async () => {
    const { wrapper } = mountSubpage({
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
        analysed: 1,
        unreadable: [],
        unparsed: 0,
        pendingMigration: false,
      },
    });
    await flushPromises();

    expect(wrapper.text()).toContain(m.maintenance_check_fix_all());
    expect(wrapper.findAll("button").filter((b) => b.text() === m.maintenance_check_fix())).toHaveLength(0);
  });

  it("applies only rewrites when fixing everything safe", async () => {
    const apply = vi.fn(() => AsyncResult.ok([]));
    const { wrapper } = mountSubpage({
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
            repair: { kind: "undecidable", reason: "anchor-contested" },
          },
        ],
        analysed: 2,
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
});
