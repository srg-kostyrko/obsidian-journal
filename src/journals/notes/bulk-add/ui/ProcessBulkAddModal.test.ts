import userEvent from "@testing-library/user-event";
import { cleanup, render, screen } from "@testing-library/vue";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { AnchorString } from "@/calendar";
import { m } from "@/i18n";
import { Container, provideInjectorOnApp } from "@/infrastructure/di";
import type { VaultPath } from "@/infrastructure/host";
import type { ModalApi } from "@/infrastructure/host/modals";
import { provideModalApiOnApp } from "@/infrastructure/host/modals/testing";
import { AsyncResult } from "@/infrastructure/result";

import { BulkAddService, type BulkPlan, type PlannedSkip } from "../bulk-add-service";
import { defaultBulkAddParameters } from "../config";

import ProcessBulkAddModal from "./ProcessBulkAddModal.vue";

interface MountOptions {
  apply: ReturnType<typeof vi.fn>;
  plan: BulkPlan;
  dryRun?: boolean;
}

function mountModal({ apply, plan, dryRun }: MountOptions) {
  const submit = vi.fn();
  const cancel = vi.fn();
  const api: ModalApi<void> = { submit, cancel };

  const container = new Container();
  container
    .register(BulkAddService)
    .useValue({ apply, resolve: BulkAddService.prototype.resolve } as unknown as BulkAddService);

  render(ProcessBulkAddModal, {
    props: {
      journalName: "daily",
      plan,
      parameters: { ...defaultBulkAddParameters(), dryRun: dryRun ?? false },
    },
    global: {
      plugins: [
        {
          install(app) {
            provideInjectorOnApp(app, container);
            provideModalApiOnApp(app, api as unknown as ModalApi<unknown>);
          },
        },
      ],
    },
  });

  return { submit, cancel };
}

afterEach(() => cleanup());

describe("ProcessBulkAddModal", () => {
  it("shows the action log after running", async () => {
    const apply = vi.fn(() =>
      AsyncResult.ok([{ path: "src/a.md" as VaultPath, actions: ["Connected to daily at 2026-06-01."] }]),
    );
    mountModal({
      apply,
      plan: {
        notes: [
          {
            kind: "action",
            path: "src/a.md" as VaultPath,
            anchor: "2026-06-01" as AnchorString,
            targetPath: "src/a.md" as VaultPath,
            existing: "none",
            folder: "n/a",
            name: "n/a",
          },
        ],
      },
    });
    await userEvent.click(screen.getByText(m.bulk_add_run()));
    expect(await screen.findByText("Connected to daily at 2026-06-01.")).toBeTruthy();
  });

  it("runs apply with the dry-run flag from params", async () => {
    const apply = vi.fn(() => AsyncResult.ok([]));
    mountModal({ apply, dryRun: true, plan: { notes: [] } });
    await userEvent.click(screen.getByText(m.bulk_add_run()));
    expect(apply).toHaveBeenCalledWith("daily", expect.any(Array), true, expect.any(Function));
  });

  it("shows the occupying note and the target path for a conflicting action", () => {
    const apply = vi.fn(() => AsyncResult.ok([]));
    mountModal({
      apply,
      plan: {
        notes: [
          {
            kind: "action",
            path: "src/a.md" as VaultPath,
            anchor: "2026-06-01" as AnchorString,
            occupant: "daily/2026-06-01.md" as VaultPath,
            targetPath: "daily/2026-06-01.md" as VaultPath,
            existing: "ask",
            folder: "move",
            name: "rename",
          },
        ],
      },
    });
    expect(screen.getByText(m.bulk_add_occupant({ path: "daily/2026-06-01.md" }))).toBeTruthy();
    expect(screen.getByText(m.bulk_add_target({ path: "daily/2026-06-01.md" }))).toBeTruthy();
  });

  it("shows the skip reason for each skipped note", () => {
    const apply = vi.fn(() => AsyncResult.ok([]));
    const skip: PlannedSkip = { kind: "skip", path: "src/x.md" as VaultPath, reason: "no-date" };
    mountModal({ apply, plan: { notes: [skip] } });
    expect(screen.getByText("src/x.md")).toBeTruthy();
    expect(screen.getByText(m.bulk_add_skip_reason_no_date())).toBeTruthy();
  });

  it("resolves a per-note folder ask decision into the apply call", async () => {
    const apply = vi.fn(() => AsyncResult.ok([]));
    mountModal({
      apply,
      plan: {
        notes: [
          {
            kind: "action",
            path: "src/a.md" as VaultPath,
            anchor: "2026-06-01" as AnchorString,
            targetPath: "daily/a.md" as VaultPath,
            existing: "none",
            folder: "ask",
            name: "n/a",
          },
        ],
      },
    });
    await userEvent.selectOptions(screen.getByRole("combobox", { name: m.bulk_add_other_folder_label() }), "move");
    await userEvent.click(screen.getByText(m.bulk_add_run()));
    expect(apply).toHaveBeenCalledWith(
      "daily",
      [expect.objectContaining({ path: "src/a.md", move: true })],
      expect.any(Boolean),
      expect.any(Function),
    );
  });

  it("resolves a per-note existing ask decision into the apply call", async () => {
    const apply = vi.fn(() => AsyncResult.ok([]));
    mountModal({
      apply,
      plan: {
        notes: [
          {
            kind: "action",
            path: "src/a.md" as VaultPath,
            anchor: "2026-06-01" as AnchorString,
            occupant: "daily/2026-06-01.md" as VaultPath,
            targetPath: "src/a.md" as VaultPath,
            existing: "ask",
            folder: "n/a",
            name: "n/a",
          },
        ],
      },
    });
    await userEvent.selectOptions(screen.getByRole("combobox", { name: m.bulk_add_existing_label() }), "merge");
    await userEvent.click(screen.getByText(m.bulk_add_run()));
    expect(apply).toHaveBeenCalledWith(
      "daily",
      [expect.objectContaining({ path: "src/a.md", existing: "merge" })],
      expect.any(Boolean),
      expect.any(Function),
    );
  });

  it("resolves a per-note name ask decision into the apply call", async () => {
    const apply = vi.fn(() => AsyncResult.ok([]));
    mountModal({
      apply,
      plan: {
        notes: [
          {
            kind: "action",
            path: "src/a.md" as VaultPath,
            anchor: "2026-06-01" as AnchorString,
            targetPath: "src/2026-06-01.md" as VaultPath,
            existing: "none",
            folder: "n/a",
            name: "ask",
          },
        ],
      },
    });
    await userEvent.selectOptions(screen.getByRole("combobox", { name: m.bulk_add_other_name_label() }), "rename");
    await userEvent.click(screen.getByText(m.bulk_add_run()));
    expect(apply).toHaveBeenCalledWith(
      "daily",
      [expect.objectContaining({ path: "src/a.md", rename: true })],
      expect.any(Boolean),
      expect.any(Function),
    );
  });
});
