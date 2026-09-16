import userEvent from "@testing-library/user-event";
import { screen } from "@testing-library/vue";
import { beforeEach, describe, expect, it } from "vitest";

import { m } from "@/i18n";
import { testContainer, type TestHarness } from "@/testing";

import { buildImportPlan, buildPlanRow, buildSourceJournal } from "../testing";

import ImportPreviewModal from "./ImportPreviewModal.vue";
import { sourceName } from "./source-names";

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
      shelves: [],
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

  it("shows the template a journal will use", () => {
    harness.renderModal(ImportPreviewModal, {
      props: {
        plan: buildImportPlan({
          rows: [buildPlanRow({ journal: buildSourceJournal({ templates: ["Templates/Day"] }) })],
        }),
      },
    });

    expect(screen.getByText(m.import_preview_row_template({ path: "Templates/Day" }))).toBeTruthy();
  });

  it("says a period is already set up", () => {
    harness.renderModal(ImportPreviewModal, {
      props: { plan: buildImportPlan({ rows: [buildPlanRow({ state: { kind: "set-up", journalName: "days" } })] }) },
    });

    expect(screen.getByText(m.import_preview_row_set_up())).toBeTruthy();
  });

  it("shows a set-up row under the name of the journal that sets it up, with no name to edit", () => {
    harness.renderModal(ImportPreviewModal, {
      props: {
        plan: buildImportPlan({
          rows: [buildPlanRow({ name: "Daily 2", state: { kind: "set-up", journalName: "Daily" } })],
        }),
      },
    });

    expect(screen.getByText("Daily")).toBeTruthy();
    expect(screen.queryByLabelText(m.import_preview_name_label())).toBeNull();
  });

  it("names the journal that is already set up in the startup line", () => {
    const row = buildPlanRow({ name: "Daily 2", state: { kind: "set-up", journalName: "Daily" } });
    harness.renderModal(ImportPreviewModal, {
      props: { plan: buildImportPlan({ rows: [row], startup: { kind: "set", rowKey: row.key } }) },
    });

    expect(screen.getByText(m.import_preview_startup_description({ name: "Daily" }))).toBeTruthy();
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

  it("groups a calendar set's journals under an editable shelf name", () => {
    harness.renderModal(ImportPreviewModal, {
      props: {
        plan: buildImportPlan({
          rows: [buildPlanRow({ shelf: "Work" })],
          shelves: ["Work"],
        }),
      },
    });

    expect(screen.getByLabelText<HTMLInputElement>(m.import_preview_shelf_label()).value).toBe("Work");
  });

  it("submits a shelf name edited in the preview", async () => {
    const { submit } = harness.renderModal(ImportPreviewModal, {
      props: { plan: buildImportPlan({ rows: [buildPlanRow({ shelf: "Work" })], shelves: ["Work"] }) },
    });
    const input = screen.getByLabelText(m.import_preview_shelf_label());

    await userEvent.clear(input);
    await userEvent.type(input, "Home");
    await userEvent.click(screen.getByText(m.import_preview_confirm()));

    expect(submit).toHaveBeenCalledWith(expect.objectContaining({ shelves: [{ planned: "Work", name: "Home" }] }));
  });

  it("holds the import back while a shelf a journal lands on has no name", async () => {
    const { submit } = harness.renderModal(ImportPreviewModal, {
      props: { plan: buildImportPlan({ rows: [buildPlanRow({ shelf: "Work" })], shelves: ["Work"] }) },
    });

    await userEvent.clear(screen.getByLabelText(m.import_preview_shelf_label()));
    await userEvent.click(screen.getByText(m.import_preview_confirm()));

    expect(screen.getByText(m.shelf_name_required_error())).toBeTruthy();
    expect(submit).not.toHaveBeenCalled();
  });

  // No journal lands on the shelf, so the import never creates it and the blank name costs nothing.
  it("imports with a blank shelf name once every journal on that shelf is switched off", async () => {
    const { submit } = harness.renderModal(ImportPreviewModal, {
      props: { plan: buildImportPlan({ rows: [buildPlanRow({ shelf: "Work" })], shelves: ["Work"] }) },
    });

    await userEvent.clear(screen.getByLabelText(m.import_preview_shelf_label()));
    await userEvent.click(screen.getByLabelText(m.import_preview_include()));
    await userEvent.click(screen.getByText(m.import_preview_confirm()));

    expect(submit).toHaveBeenCalled();
  });

  // apply() returns "skipped" and drops connect the moment include is false, so the modal must not
  // offer a combination the import ignores.
  it("stops offering to connect notes once the journal is not being created", async () => {
    const { submit } = harness.renderModal(ImportPreviewModal, { props: { plan: buildImportPlan() } });

    await userEvent.click(screen.getByLabelText(m.import_preview_include()));
    await userEvent.click(screen.getByLabelText(m.import_preview_connect()));
    await userEvent.click(screen.getByText(m.import_preview_confirm()));

    expect(submit).toHaveBeenCalledWith(
      expect.objectContaining({ rows: [expect.objectContaining({ include: false, connect: false })] }),
    );
  });

  it("keeps offering to connect notes to a journal that is already set up", async () => {
    const { submit } = harness.renderModal(ImportPreviewModal, {
      props: { plan: buildImportPlan({ rows: [buildPlanRow({ state: { kind: "set-up", journalName: "days" } })] }) },
    });

    await userEvent.click(screen.getByText(m.import_preview_confirm()));

    expect(submit).toHaveBeenCalledWith(
      expect.objectContaining({ rows: [expect.objectContaining({ include: false, connect: true })] }),
    );
  });

  it("marks only the journal rows that land on a shelf as belonging to it", () => {
    const { container } = harness.renderModal(ImportPreviewModal, {
      props: {
        plan: buildImportPlan({
          rows: [
            buildPlanRow({ journal: buildSourceJournal({ set: "Work" }), shelf: "Work" }),
            buildPlanRow({ journal: buildSourceJournal({ source: "daily-notes" }) }),
          ],
          shelves: ["Work"],
        }),
      },
    });

    expect(container.querySelectorAll(".import-shelved-row")).toHaveLength(1);
  });

  // Calendar with its weekly note off contributes a week start and no journals, so the plan still
  // carries a reading for it. A heading with nothing under it says only that the plugin was read.
  it("leaves out a source heading for a plugin that contributes no journal", () => {
    harness.renderModal(ImportPreviewModal, {
      props: {
        plan: buildImportPlan({
          readings: [
            { source: "periodic-notes", configured: true, journals: [buildSourceJournal()] },
            { source: "calendar", configured: true, journals: [] },
          ],
        }),
      },
    });

    expect(screen.getByText(sourceName("periodic-notes"))).toBeTruthy();
    expect(screen.queryByText(sourceName("calendar"))).toBeNull();
  });

  it("cancels", async () => {
    const { cancel } = harness.renderModal(ImportPreviewModal, { props: { plan: buildImportPlan() } });

    await userEvent.click(screen.getByText(m.common_action_cancel()));

    expect(cancel).toHaveBeenCalled();
  });
});
