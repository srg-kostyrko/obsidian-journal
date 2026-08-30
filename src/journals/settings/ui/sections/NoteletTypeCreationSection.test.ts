import userEvent from "@testing-library/user-event";
import { screen, waitFor, within } from "@testing-library/vue";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { m } from "@/i18n";
import { JournalsRepository } from "@/journals";
import { journalsCoreModule } from "@/journals/module";
import type { NoteletType, TypeId } from "@/journals/notelets/config";
import { buildNoteletType, fixedJournal } from "@/journals/testing";
import { testContainer, type TestHarness } from "@/testing";

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

  it("shows the counter property field while the counter is on", async () => {
    await setup({ counter: { enabled: true, frontmatterKey: "journal-notelet-index" } });

    expect(screen.getByText(m.journal_notelet_counter_key_label())).toBeTruthy();
  });

  it("hides the counter property field while the counter is off", async () => {
    await setup({ counter: { enabled: false, frontmatterKey: "journal-notelet-index" } });

    expect(screen.queryByText(m.journal_notelet_counter_key_label())).toBeNull();
  });

  it("previews the path the type's own name template resolves to", async () => {
    await setup({ nameTemplate: "{{journal_name}} {{notelet_index}}", folder: "Meetings" });

    expect(screen.getByText("Meetings/Work 1.md")).toBeTruthy();
  });

  it("warns instead of previewing when the name template renders empty", async () => {
    await setup({ nameTemplate: "" });

    expect(screen.getByText(m.journal_edit_name_template_empty_warning())).toBeTruthy();
  });
});
