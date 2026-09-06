import userEvent from "@testing-library/user-event";
import { screen } from "@testing-library/vue";
import { describe, expect, it, vi } from "vitest";

import { m } from "@/i18n";
import { Flows } from "@/infrastructure/flows";
import { AsyncResult } from "@/infrastructure/result";
import { journalsCoreModule } from "@/journals/module";
import type { TypeId } from "@/journals/notelets/config";
import { buildNoteletType, fixedJournal } from "@/journals/testing";
import { SettingsUiService } from "@/settings";
import { testContainer, type TestHarness } from "@/testing";

import { AddNoteletTypeFlow } from "../../flows/add-notelet-type.flow";
import { journalsSettingsCoreModule } from "../../module";
import { journalsSettingsUiModule } from "../../ui-module";

import NoteletTypesSection from "./NoteletTypesSection.vue";

const modules = [journalsCoreModule, journalsSettingsCoreModule, journalsSettingsUiModule];

async function withTypes(): Promise<TestHarness> {
  const harness = await testContainer({
    modules,
    data: {
      journals: {
        Work: fixedJournal(
          "Work",
          { type: "day" },
          {
            notelets: {
              nt_7f3a: buildNoteletType({ id: "nt_7f3a" as TypeId, name: "Standup" }),
              nt_91cc: buildNoteletType({ id: "nt_91cc" as TypeId, name: "Retro" }),
            },
          },
        ),
      },
    },
  });
  harness.render(NoteletTypesSection, { props: { journalName: "Work" } });
  return harness;
}

async function expand(): Promise<void> {
  await userEvent.click(screen.getByText(m.journal_notelet_section_title()));
}

describe("NoteletTypesSection", () => {
  it("lists the journal's types by name", async () => {
    await withTypes();

    await expand();

    expect(await screen.findByText("Standup")).toBeTruthy();
    expect(screen.getByText("Retro")).toBeTruthy();
  });

  it("shows an empty state when the journal has no types", async () => {
    const harness = await testContainer({
      modules,
      data: { journals: { Work: fixedJournal("Work", { type: "day" }) } },
    });
    harness.render(NoteletTypesSection, { props: { journalName: "Work" } });

    await expand();

    expect(await screen.findByText(m.journal_notelet_section_empty())).toBeTruthy();
  });

  it("invokes the add flow for this journal", async () => {
    const harness = await withTypes();
    const invoke = vi.spyOn(harness.resolve(Flows), "invoke").mockReturnValue(AsyncResult.ok(undefined));

    await userEvent.click(screen.getByLabelText(m.journal_notelet_add()));

    expect(invoke).toHaveBeenCalledWith(AddNoteletTypeFlow, { journalName: "Work" });
  });

  it("navigates to the clicked type's subpage by id", async () => {
    const harness = await withTypes();
    await expand();

    await screen.findByText("Retro");
    await userEvent.click(screen.getAllByLabelText(m.journal_notelet_edit())[1]);

    const ui = harness.resolve(SettingsUiService);
    expect(ui.current.value?.subpage.key).toBe("notelet-type-edit");
    expect(ui.current.value?.props).toEqual({ journalName: "Work", typeId: "nt_91cc" });
  });

  it("offers no delete control on a listed type", async () => {
    await withTypes();
    await expand();

    const name = await screen.findByText("Standup");
    const row = name.closest(".notelet-type-row");
    const controls = [...(row?.querySelectorAll("[aria-label]") ?? [])].map((el) => el.getAttribute("aria-label"));
    expect(controls).toEqual([m.journal_notelet_edit()]);
  });
});
