import userEvent from "@testing-library/user-event";
import { screen, waitFor } from "@testing-library/vue";
import { beforeEach, describe, expect, it } from "vitest";

import { anchor } from "@/calendar/testing";
import { m } from "@/i18n";
import type { VaultPath } from "@/infrastructure/host";
import { testContainer, type TestHarness } from "@/testing";

import { JournalsIndex } from "../../../journals-index";
import { journalsCoreModule } from "../../../module";
import { fixedJournal } from "../../../testing";
import { defaultBulkAddParameters } from "../config";

import ProcessBulkAddModal from "./ProcessBulkAddModal.vue";

import type { PlannedSkip } from "../bulk-add-service";

describe("ProcessBulkAddModal", () => {
  let harness: TestHarness;

  beforeEach(async () => {
    harness = await testContainer({
      modules: [journalsCoreModule],
      data: { journals: { daily: fixedJournal("daily", { type: "day" }, { folder: "Daily" }) } },
    });
  });

  it("shows the action log after running", async () => {
    harness.host.putFile("src/a.md", "content");
    harness.renderModal(ProcessBulkAddModal, {
      props: {
        journalName: "daily",
        plan: {
          notes: [
            {
              kind: "action",
              path: "src/a.md" as VaultPath,
              anchor: anchor("2026-06-01"),
              targetPath: "src/a.md" as VaultPath,
              existing: "none",
              folder: "n/a",
              name: "n/a",
            },
          ],
        },
        parameters: { ...defaultBulkAddParameters(), dryRun: false },
      },
    });

    await userEvent.click(screen.getByText(m.bulk_add_run()));

    expect(await screen.findByText("Connected to daily at 2026-06-01.")).toBeTruthy();
  });

  it("words the log in the future tense for a dry run so it is not mistaken for a completed run", async () => {
    harness.host.putFile("src/a.md", "content");
    harness.renderModal(ProcessBulkAddModal, {
      props: {
        journalName: "daily",
        plan: {
          notes: [
            {
              kind: "action",
              path: "src/a.md" as VaultPath,
              anchor: anchor("2026-06-01"),
              targetPath: "src/a.md" as VaultPath,
              existing: "none",
              folder: "n/a",
              name: "n/a",
            },
          ],
        },
        parameters: { ...defaultBulkAddParameters(), dryRun: true },
      },
    });

    await userEvent.click(screen.getByText(m.bulk_add_run()));

    expect(await screen.findByText("Will connect to daily at 2026-06-01.")).toBeTruthy();
  });

  it("announces that a dry run changed nothing", async () => {
    harness.renderModal(ProcessBulkAddModal, {
      props: { journalName: "daily", plan: { notes: [] }, parameters: { ...defaultBulkAddParameters(), dryRun: true } },
    });

    await userEvent.click(screen.getByText(m.bulk_add_run()));

    expect(await screen.findByText(m.bulk_add_dry_run_banner())).toBeTruthy();
  });

  it("does not announce a dry run after a real run", async () => {
    harness.renderModal(ProcessBulkAddModal, {
      props: {
        journalName: "daily",
        plan: { notes: [] },
        parameters: { ...defaultBulkAddParameters(), dryRun: false },
      },
    });

    await userEvent.click(screen.getByText(m.bulk_add_run()));

    expect(screen.queryByText(m.bulk_add_dry_run_banner())).toBeNull();
  });

  it("runs apply with the dry-run flag from params", async () => {
    harness.host.putFile("src/a.md", "content");
    harness.renderModal(ProcessBulkAddModal, {
      props: {
        journalName: "daily",
        plan: {
          notes: [
            {
              kind: "action",
              path: "src/a.md" as VaultPath,
              anchor: anchor("2026-06-01"),
              targetPath: "src/a.md" as VaultPath,
              existing: "none",
              folder: "n/a",
              name: "n/a",
            },
          ],
        },
        parameters: { ...defaultBulkAddParameters(), dryRun: true },
      },
    });

    await userEvent.click(screen.getByText(m.bulk_add_run()));

    await waitFor(() => expect(screen.getByText(m.common_action_close())).toBeTruthy());
    expect(harness.host.files.get("src/a.md")?.frontmatter).toEqual({});
  });

  it("shows the occupying note and the target path for a conflicting action", () => {
    harness.renderModal(ProcessBulkAddModal, {
      props: {
        journalName: "daily",
        plan: {
          notes: [
            {
              kind: "action",
              path: "src/a.md" as VaultPath,
              anchor: anchor("2026-06-01"),
              occupant: "daily/2026-06-01.md" as VaultPath,
              targetPath: "daily/2026-06-01.md" as VaultPath,
              existing: "ask",
              folder: "move",
              name: "rename",
            },
          ],
        },
        parameters: { ...defaultBulkAddParameters(), dryRun: false },
      },
    });

    expect(screen.getByText(m.bulk_add_occupant({ path: "daily/2026-06-01.md" }))).toBeTruthy();
    expect(screen.getByText(m.bulk_add_target({ path: "daily/2026-06-01.md" }))).toBeTruthy();
  });

  it("shows the skip reason for each skipped note", () => {
    const skip: PlannedSkip = { kind: "skip", path: "src/x.md" as VaultPath, reason: "no-date" };
    harness.renderModal(ProcessBulkAddModal, {
      props: { journalName: "daily", plan: { notes: [skip] }, parameters: defaultBulkAddParameters() },
    });

    expect(screen.getByText("src/x.md")).toBeTruthy();
    expect(screen.getByText(m.bulk_add_skip_reason_no_date())).toBeTruthy();
  });

  it("explains a refused rename in the plan instead of showing nothing", () => {
    harness.renderModal(ProcessBulkAddModal, {
      props: {
        journalName: "daily",
        plan: {
          notes: [
            {
              kind: "action",
              path: "src/a.md" as VaultPath,
              anchor: anchor("2026-06-01"),
              targetPath: "src/a.md" as VaultPath,
              existing: "none",
              folder: "n/a",
              name: "refused-prompt",
            },
          ],
        },
        parameters: defaultBulkAddParameters(),
      },
    });

    expect(screen.getByText(m.bulk_add_log_rename_refused_prompt())).toBeTruthy();
  });

  it("logs a refused rename after running instead of dropping it silently", async () => {
    harness.host.putFile("src/a.md", "content");
    harness.renderModal(ProcessBulkAddModal, {
      props: {
        journalName: "daily",
        plan: {
          notes: [
            {
              kind: "action",
              path: "src/a.md" as VaultPath,
              anchor: anchor("2026-06-01"),
              targetPath: "src/a.md" as VaultPath,
              existing: "none",
              folder: "move",
              name: "refused-prompt",
            },
          ],
        },
        parameters: { ...defaultBulkAddParameters(), dryRun: false },
      },
    });

    await userEvent.click(screen.getByText(m.bulk_add_run()));

    expect(await screen.findByText(m.bulk_add_log_rename_refused_prompt())).toBeTruthy();
    expect(harness.host.files.has("Daily/a.md")).toBe(true);
  });

  it("resolves a per-note folder ask decision into the apply call", async () => {
    harness.host.putFile("src/a.md", "content");
    harness.renderModal(ProcessBulkAddModal, {
      props: {
        journalName: "daily",
        plan: {
          notes: [
            {
              kind: "action",
              path: "src/a.md" as VaultPath,
              anchor: anchor("2026-06-01"),
              targetPath: "Daily/a.md" as VaultPath,
              existing: "none",
              folder: "ask",
              name: "n/a",
            },
          ],
        },
        parameters: { ...defaultBulkAddParameters(), dryRun: false },
      },
    });

    await userEvent.selectOptions(screen.getByRole("combobox", { name: m.bulk_add_other_folder_label() }), "move");
    await userEvent.click(screen.getByText(m.bulk_add_run()));

    await waitFor(() => expect(screen.getByText(m.common_action_close())).toBeTruthy());
    expect(harness.host.files.has("src/a.md")).toBe(false);
    expect(harness.host.files.has("Daily/a.md")).toBe(true);
  });

  it("resolves a per-note existing ask decision into the apply call", async () => {
    harness.host.putFile("Daily/2026-06-01.md", "OCCUPANT", {
      journal: "daily",
      "journal-date": "2026-06-01",
    });
    harness.resolve(JournalsIndex).register({
      journalName: "daily",
      anchor: anchor("2026-06-01"),
      path: "Daily/2026-06-01.md" as VaultPath,
    });
    harness.host.putFile("src/a.md", "SOURCE");
    harness.renderModal(ProcessBulkAddModal, {
      props: {
        journalName: "daily",
        plan: {
          notes: [
            {
              kind: "action",
              path: "src/a.md" as VaultPath,
              anchor: anchor("2026-06-01"),
              targetPath: "src/a.md" as VaultPath,
              occupant: "Daily/2026-06-01.md" as VaultPath,
              existing: "ask",
              folder: "n/a",
              name: "n/a",
            },
          ],
        },
        parameters: { ...defaultBulkAddParameters(), dryRun: false },
      },
    });

    await userEvent.selectOptions(screen.getByRole("combobox", { name: m.bulk_add_existing_label() }), "merge");
    await userEvent.click(screen.getByText(m.bulk_add_run()));

    await waitFor(() => expect(screen.getByText(m.common_action_close())).toBeTruthy());
    expect(harness.host.files.has("src/a.md")).toBe(false);
    expect(harness.host.files.get("Daily/2026-06-01.md")?.content).toContain("SOURCE");
  });

  it("resolves a per-note name ask decision into the apply call", async () => {
    harness.host.putFile("src/a.md", "content");
    harness.renderModal(ProcessBulkAddModal, {
      props: {
        journalName: "daily",
        plan: {
          notes: [
            {
              kind: "action",
              path: "src/a.md" as VaultPath,
              anchor: anchor("2026-06-01"),
              targetPath: "src/2026-06-01.md" as VaultPath,
              existing: "none",
              folder: "n/a",
              name: "ask",
            },
          ],
        },
        parameters: { ...defaultBulkAddParameters(), dryRun: false },
      },
    });

    await userEvent.selectOptions(screen.getByRole("combobox", { name: m.bulk_add_other_name_label() }), "rename");
    await userEvent.click(screen.getByText(m.bulk_add_run()));

    await waitFor(() => expect(screen.getByText(m.common_action_close())).toBeTruthy());
    expect(harness.host.files.has("src/a.md")).toBe(false);
    expect(harness.host.files.has("src/2026-06-01.md")).toBe(true);
  });
});
