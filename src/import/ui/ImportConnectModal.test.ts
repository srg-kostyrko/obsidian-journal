import userEvent from "@testing-library/user-event";
import { screen } from "@testing-library/vue";
import { describe, expect, it } from "vitest";

import { m } from "@/i18n";
import { journalsCoreModule } from "@/journals/module";
import { fixedJournal } from "@/journals/testing";
import { testContainer, type TestHarness } from "@/testing";

import { ImportConnectService } from "../connect-service";
import { importCoreModule } from "../module";
import { buildImportOutcome } from "../testing";

import ImportConnectModal from "./ImportConnectModal.vue";

import type { ImportOutcome } from "../import-service";

async function openedOn(outcome: ImportOutcome, prepare: (harness: TestHarness) => void = () => undefined) {
  const harness = await testContainer({
    modules: [journalsCoreModule, importCoreModule],
    data: {
      journals: {
        daily: fixedJournal(
          "daily",
          { type: "day" },
          { folder: "Journal", dateFormat: "YYYY-MM-DD", nameTemplate: "{{date}}" },
        ),
      },
    },
  });
  prepare(harness);
  const connect = await harness.resolve(ImportConnectService).plan(outcome);
  return { harness, ...harness.renderModal(ImportConnectModal, { props: { outcome, connect } }) };
}

const existingDaily = buildImportOutcome([{ key: "k", kind: "existing", journalName: "daily", connect: true }]);

describe("ImportConnectModal", () => {
  it("says how many notes each journal will connect", async () => {
    await openedOn(existingDaily, (harness) => harness.host.putFile("Journal/2026-06-01.md"));

    expect(screen.getByText(m.import_connect_count({ count: 1 }))).toBeTruthy();
  });

  it("counts skipped notes by reason", async () => {
    await openedOn(existingDaily, (harness) => harness.host.putFile("Journal/misfiled/2026-06-01.md"));

    expect(
      screen.getByText(m.import_connect_skipped({ count: 1, reason: m.bulk_add_skip_reason_not_on_journal_path() })),
    ).toBeTruthy();
  });

  it("reports the notes it connected", async () => {
    await openedOn(existingDaily, (harness) => harness.host.putFile("Journal/2026-06-01.md"));

    await userEvent.click(screen.getByText(m.import_connect_run()));

    expect(await screen.findByText(m.import_report_connected({ name: "daily", count: 1 }))).toBeTruthy();
  });

  it("keeps notes unconnected when the connection is skipped", async () => {
    const { harness } = await openedOn(existingDaily, (seeded) => seeded.host.putFile("Journal/2026-06-01.md"));

    await userEvent.click(screen.getByText(m.import_connect_skip()));

    expect(await screen.findByText(m.import_report_heading())).toBeTruthy();
    expect(harness.host.files.get("Journal/2026-06-01.md")?.frontmatter).toEqual({});
  });

  it("says when no snapshot could be taken", async () => {
    await openedOn({ ...buildImportOutcome([]), snapshotWritten: false });

    expect(screen.getByText(m.import_report_snapshot_failed())).toBeTruthy();
  });

  it("closes from the report", async () => {
    const { submit } = await openedOn(buildImportOutcome([]));

    await userEvent.click(screen.getByText(m.common_action_close()));

    expect(submit).toHaveBeenCalled();
  });
});
