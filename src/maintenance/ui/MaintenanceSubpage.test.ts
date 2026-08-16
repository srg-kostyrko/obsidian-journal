import userEvent from "@testing-library/user-event";
import { cleanup, render, screen, within } from "@testing-library/vue";
import { afterEach, describe, expect, it, vi } from "vitest";

import { m } from "@/i18n";
import { type Container, provideInjectorOnApp } from "@/infrastructure/di";
import { NoticeService, PluginDataIOError } from "@/infrastructure/host";
import { FakeNoticeService } from "@/infrastructure/host/testing";
import { AsyncResult } from "@/infrastructure/result";
import { CURRENT_VERSION } from "@/settings";
import { createSettingsService } from "@/settings/testing";

import MaintenanceSubpage from "./MaintenanceSubpage.vue";

afterEach(() => cleanup());

async function setup(files: Record<string, string> = {}) {
  const { service: settings, data, container } = createSettingsService({ raw: { version: CURRENT_VERSION } });
  await settings.initialize();
  for (const [name, contents] of Object.entries(files)) data.files.set(name, contents);
  const notices = new FakeNoticeService();
  container.register(NoticeService).useValue(notices);
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
});
