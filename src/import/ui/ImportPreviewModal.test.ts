import userEvent from "@testing-library/user-event";
import { screen } from "@testing-library/vue";
import { beforeEach, describe, expect, it } from "vitest";

import { m } from "@/i18n";
import { testContainer, type TestHarness } from "@/testing";

import { buildImportPlan, buildPlanRow, buildSourceJournal } from "../testing";

import ImportPreviewModal from "./ImportPreviewModal.vue";

describe("ImportPreviewModal", () => {
  let harness: TestHarness;

  beforeEach(async () => {
    harness = await testContainer({ modules: [] });
  });

  it("submits the proposed journals with their names", async () => {
    const plan = buildImportPlan();
    const { submit } = harness.renderModal(ImportPreviewModal, { props: { plan } });

    await userEvent.click(screen.getByText(m.import_preview_confirm()));

    expect(submit).toHaveBeenCalledWith({
      rows: [{ key: plan.rows.at(0)?.key, name: "Daily", include: true, connect: true }],
      applyWeekStart: false,
      setStartup: false,
    });
  });

  it("submits a journal name edited in the preview", async () => {
    const { submit } = harness.renderModal(ImportPreviewModal, { props: { plan: buildImportPlan() } });
    const input = screen.getByLabelText(m.import_preview_name_label());

    await userEvent.clear(input);
    await userEvent.type(input, "Days");
    await userEvent.click(screen.getByText(m.import_preview_confirm()));

    expect(submit).toHaveBeenCalledWith(expect.objectContaining({ rows: [expect.objectContaining({ name: "Days" })] }));
  });

  it("proposes a superseded journal switched off", async () => {
    const plan = buildImportPlan({
      rows: [
        buildPlanRow({
          journal: buildSourceJournal({ source: "daily-notes" }),
          state: { kind: "superseded", by: "periodic-notes" },
        }),
      ],
    });
    const { submit } = harness.renderModal(ImportPreviewModal, { props: { plan } });

    await userEvent.click(screen.getByText(m.import_preview_confirm()));

    expect(submit).toHaveBeenCalledWith(
      expect.objectContaining({ rows: [expect.objectContaining({ include: false })] }),
    );
  });

  it("names the journal that already sets up a period", () => {
    harness.renderModal(ImportPreviewModal, {
      props: { plan: buildImportPlan({ rows: [buildPlanRow({ state: { kind: "set-up", journalName: "days" } })] }) },
    });

    expect(screen.getByText(m.import_preview_row_set_up({ journalName: "days" }))).toBeTruthy();
  });

  it("warns about weekly notes while the offered week start is switched off", () => {
    harness.renderModal(ImportPreviewModal, {
      props: {
        plan: buildImportPlan({
          rows: [buildPlanRow({ journal: buildSourceJournal({ period: "week" }) })],
          weekStart: { kind: "offer", next: { mode: "custom", dow: 0, doy: 6, global: false }, tickedByDefault: false },
        }),
      },
    });

    expect(screen.getByText(m.import_preview_warning_week_start())).toBeTruthy();
  });

  it("does not warn about weekly notes once the week start is switched on", async () => {
    harness.renderModal(ImportPreviewModal, {
      props: {
        plan: buildImportPlan({
          rows: [buildPlanRow({ journal: buildSourceJournal({ period: "week" }) })],
          weekStart: { kind: "offer", next: { mode: "custom", dow: 0, doy: 6, global: false }, tickedByDefault: false },
        }),
      },
    });

    await userEvent.click(screen.getByLabelText(m.import_preview_week_start_label()));

    expect(screen.queryByText(m.import_preview_warning_week_start())).toBeNull();
  });

  it("does not set the startup journal while that journal is switched off", async () => {
    const row = buildPlanRow();
    const { submit } = harness.renderModal(ImportPreviewModal, {
      props: { plan: buildImportPlan({ rows: [row], startup: { kind: "set", rowKey: row.key } }) },
    });

    await userEvent.click(screen.getByLabelText(m.import_preview_include()));
    await userEvent.click(screen.getByText(m.import_preview_confirm()));

    expect(submit).toHaveBeenCalledWith(expect.objectContaining({ setStartup: false }));
  });

  it("offers the startup journal for a journal that is already set up", async () => {
    const row = buildPlanRow({ state: { kind: "set-up", journalName: "days" } });
    const { submit } = harness.renderModal(ImportPreviewModal, {
      props: { plan: buildImportPlan({ rows: [row], startup: { kind: "set", rowKey: row.key } }) },
    });

    await userEvent.click(screen.getByText(m.import_preview_confirm()));

    expect(submit).toHaveBeenCalledWith(expect.objectContaining({ setStartup: true }));
  });

  it("cancels", async () => {
    const { cancel } = harness.renderModal(ImportPreviewModal, { props: { plan: buildImportPlan() } });

    await userEvent.click(screen.getByText(m.common_action_cancel()));

    expect(cancel).toHaveBeenCalled();
  });
});
