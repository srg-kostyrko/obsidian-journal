import userEvent from "@testing-library/user-event";
import { screen, waitFor, within } from "@testing-library/vue";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { m } from "@/i18n";
import { JournalsRepository, type Prompt } from "@/journals";
import { journalsCoreModule } from "@/journals/module";
import type { NoteletType, TypeId } from "@/journals/notelets/config";
import { buildNoteletType, fixedJournal } from "@/journals/testing";
import { testContainer, type TestHarness } from "@/testing";

import { journalsSettingsCoreModule } from "../../module";
import { journalsSettingsUiModule } from "../../ui-module";

import NoteletTypeCreationSection from "./NoteletTypeCreationSection.vue";

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-05-19T12:00:00"));
});
afterEach(() => {
  vi.useRealTimers();
});

function rowNamed(name: string): HTMLElement {
  const row = screen.getByText(name).closest(".setting-item");
  if (!row) throw new Error(`no setting row named ${name}`);
  return row as HTMLElement;
}

function typeOf(harness: TestHarness): NoteletType | undefined {
  return harness.resolve(JournalsRepository).get("Work").getOrUndefined()?.notelets.nt_7f3a;
}

async function setup(overrides: Partial<NoteletType> = {}): Promise<TestHarness> {
  const harness = await testContainer({
    modules: [journalsCoreModule],
    data: {
      journals: {
        Work: fixedJournal(
          "Work",
          { type: "day" },
          {
            notelets: {
              nt_7f3a: buildNoteletType({ id: "nt_7f3a" as TypeId, name: "Standup", ...overrides }),
            },
          },
        ),
      },
    },
  });
  harness.render(NoteletTypeCreationSection, { props: { journalName: "Work", typeId: "nt_7f3a" } });
  return harness;
}

describe("NoteletTypeCreationSection", () => {
  // The name is an identity: frontmatter stores it and parseEntry resolves a type by matching
  // it, so it is only editable behind the rename modal's uniqueness check.
  it("offers no inline name field", async () => {
    await setup();

    expect(screen.queryByText(m.journal_notelet_name_label())).toBeNull();
  });

  it("writes the edited note name template onto the type", async () => {
    const harness = await setup();

    const input = within(rowNamed(m.journal_notelet_name_template_label())).getByRole("textbox");
    await userEvent.clear(input);
    await userEvent.type(input, "Retro");

    await waitFor(() => {
      expect(typeOf(harness)?.nameTemplate).toBe("Retro");
    });
  });

  it("turns the counter off from the toggle", async () => {
    const harness = await setup({ counter: { enabled: true, frontmatterKey: "journal-notelet-index" } });

    await userEvent.click(within(rowNamed(m.journal_notelet_counter_label())).getByRole("checkbox"));

    await waitFor(() => {
      expect(typeOf(harness)?.counter.enabled).toBe(false);
    });
  });

  it("shows the counter property row while the counter is on", async () => {
    await setup({ counter: { enabled: true, frontmatterKey: "standup-number" } });

    expect(within(rowNamed(m.common_label_property_name())).getByText("standup-number")).toBeTruthy();
  });

  // The key is written after the claim, the date and the type key, so a free-text field could
  // silently overwrite one of them — it is only editable behind the validating modal.
  it("offers no inline counter property field", async () => {
    await setup({ counter: { enabled: true, frontmatterKey: "standup-number" } });

    expect(within(rowNamed(m.common_label_property_name())).queryByRole("textbox")).toBeNull();
  });

  it("opens the counter property modal from the row's edit button", async () => {
    const harness = await testContainer({
      modules: [journalsCoreModule, journalsSettingsCoreModule, journalsSettingsUiModule],
      data: {
        journals: {
          Work: fixedJournal(
            "Work",
            { type: "day" },
            { notelets: { nt_7f3a: buildNoteletType({ id: "nt_7f3a" as TypeId, name: "Standup" }) } },
          ),
        },
      },
    });
    harness.render(NoteletTypeCreationSection, { props: { journalName: "Work", typeId: "nt_7f3a" } });

    await userEvent.click(
      within(rowNamed(m.common_label_property_name())).getByLabelText(m.journal_notelet_counter_key_modal_title()),
    );

    await waitFor(() => {
      expect(harness.modals.lastOpen().props).toMatchObject({ journalName: "Work", typeId: "nt_7f3a" });
    });
  });

  it("hides the counter property field while the counter is off", async () => {
    await setup({ counter: { enabled: false, frontmatterKey: "journal-notelet-index" } });

    expect(screen.queryByText(m.common_label_property_name())).toBeNull();
  });

  it("previews the path the type's own name template resolves to", async () => {
    await setup({ nameTemplate: "{{journal_name}} {{notelet_index}}", folder: "Meetings" });

    expect(screen.getByText("Meetings/Work 1.md")).toBeTruthy();
  });

  it("warns instead of previewing when the name template renders empty", async () => {
    await setup({ nameTemplate: "" });

    expect(screen.getByText(m.journal_edit_name_template_empty_warning())).toBeTruthy();
  });

  it("does not warn about a within-period variable for the shipped default template", async () => {
    await setup();

    expect(screen.queryByText(m.journal_notelet_no_within_period_variable_warning())).toBeNull();
  });

  it("warns when the counter is removed from the default template, leaving nothing that varies within a period", async () => {
    await setup({ nameTemplate: "{{journal_name}}" });

    expect(screen.getByText(m.journal_notelet_no_within_period_variable_warning())).toBeTruthy();
  });

  it("does not warn about a path collision for the shipped default template", async () => {
    await setup();

    expect(screen.queryByText(m.journal_notelet_period_path_collision_warning())).toBeNull();
  });

  it("warns when the type's own template renders onto the journal's period-note path", async () => {
    await setup({ nameTemplate: "{{date}}", folder: "" });

    expect(screen.getByText(m.journal_notelet_period_path_collision_warning())).toBeTruthy();
  });

  // The within-period check must read the type's own prompts, not the journal's — a
  // template naming a prompt that only the journal has still leaves the type unable to
  // tell two notelets of a period apart.
  it("warns when the type's name template names a prompt that belongs to the journal, not the type", async () => {
    const mood: Prompt = { variable: "mood", question: "?", type: "text", frontmatterKey: "mood", required: false };
    const harness = await testContainer({
      modules: [journalsCoreModule],
      data: {
        journals: {
          Work: fixedJournal(
            "Work",
            { type: "day" },
            {
              prompts: [mood],
              notelets: {
                nt_7f3a: buildNoteletType({
                  id: "nt_7f3a" as TypeId,
                  name: "Standup",
                  nameTemplate: "{{mood}}",
                  prompts: [],
                }),
              },
            },
          ),
        },
      },
    });
    harness.render(NoteletTypeCreationSection, { props: { journalName: "Work", typeId: "nt_7f3a" } });

    expect(screen.getByText(m.journal_notelet_no_within_period_variable_warning())).toBeTruthy();
  });

  it("does not warn when the type's name template names a prompt that belongs to the type itself", async () => {
    const mood: Prompt = { variable: "mood", question: "?", type: "text", frontmatterKey: "mood", required: false };
    const harness = await testContainer({
      modules: [journalsCoreModule],
      data: {
        journals: {
          Work: fixedJournal(
            "Work",
            { type: "day" },
            {
              prompts: [],
              notelets: {
                nt_7f3a: buildNoteletType({
                  id: "nt_7f3a" as TypeId,
                  name: "Standup",
                  nameTemplate: "{{mood}}",
                  prompts: [mood],
                }),
              },
            },
          ),
        },
      },
    });
    harness.render(NoteletTypeCreationSection, { props: { journalName: "Work", typeId: "nt_7f3a" } });

    expect(screen.queryByText(m.journal_notelet_no_within_period_variable_warning())).toBeNull();
  });
});
