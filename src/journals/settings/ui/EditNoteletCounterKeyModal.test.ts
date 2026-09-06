import userEvent from "@testing-library/user-event";
import { screen, waitFor } from "@testing-library/vue";
import { describe, expect, it } from "vitest";

import { m } from "@/i18n";
import { journalsCoreModule } from "@/journals/module";
import type { TypeId } from "@/journals/notelets/config";
import { buildNoteletType, fixedJournal } from "@/journals/testing";
import { testContainer, type TestHarness } from "@/testing";

import EditNoteletCounterKeyModal from "./EditNoteletCounterKeyModal.vue";
import { editNoteletCounterKeyModal } from "./modals";

import type { JournalConfig } from "../../config";
import type { Prompt } from "../../prompts/config";

const TYPE = "nt_7f3a" as TypeId;

const moodPrompt: Prompt = {
  variable: "mood",
  question: "How do you feel?",
  type: "text",
  frontmatterKey: "standup-mood",
  required: false,
};

function workWith(overrides: Partial<JournalConfig> = {}): JournalConfig {
  return fixedJournal(
    "Work",
    { type: "day" },
    {
      notelets: {
        [TYPE]: buildNoteletType({ id: TYPE, name: "Standup", prompts: [moodPrompt] }),
      },
      ...overrides,
    },
  );
}

async function boot(config: JournalConfig = workWith()): Promise<TestHarness> {
  return testContainer({ modules: [journalsCoreModule], data: { journals: { Work: config } } });
}

async function submitValue(value: string): Promise<void> {
  const input = screen.getByRole("textbox");
  await userEvent.clear(input);
  await userEvent.type(input, value);
  await userEvent.click(screen.getByText(m.common_action_submit()));
}

describe("editNoteletCounterKeyModal definition", () => {
  it("titles the modal for editing the number property", () => {
    expect(editNoteletCounterKeyModal.title({ journalName: "Work", typeId: TYPE })).toBe(
      m.journal_notelet_counter_key_modal_title(),
    );
  });
});

describe("EditNoteletCounterKeyModal", () => {
  it("renders the type's current counter key", async () => {
    const harness = await boot();

    harness.renderModal(EditNoteletCounterKeyModal, { props: { journalName: "Work", typeId: TYPE } });

    expect(screen.getByText("journal-notelet-index")).toBeTruthy();
  });

  it("submits a key that collides with nothing", async () => {
    const harness = await boot();
    const { submit } = harness.renderModal(EditNoteletCounterKeyModal, {
      props: { journalName: "Work", typeId: TYPE },
    });

    await submitValue("standup-number");

    await waitFor(() => {
      expect(submit).toHaveBeenCalledWith({ newValue: "standup-number" });
    });
  });

  it("refuses an empty key, which would write a blank property", async () => {
    const harness = await boot();
    const { submit } = harness.renderModal(EditNoteletCounterKeyModal, {
      props: { journalName: "Work", typeId: TYPE },
    });

    const input = screen.getByRole("textbox");
    await userEvent.clear(input);
    await userEvent.click(screen.getByText(m.common_action_submit()));

    await waitFor(() => {
      expect(screen.getByText(m.journal_property_name_required())).toBeTruthy();
    });
    expect(submit).not.toHaveBeenCalled();
  });

  it("refuses the journal claim key, which would disconnect the notelet", async () => {
    const harness = await boot();
    const { submit } = harness.renderModal(EditNoteletCounterKeyModal, {
      props: { journalName: "Work", typeId: TYPE },
    });

    await submitValue("journal");

    await waitFor(() => {
      expect(screen.getByText(m.journal_property_key_taken({ name: "journal" }))).toBeTruthy();
    });
    expect(submit).not.toHaveBeenCalled();
  });

  it("refuses the journal's date field, which would break the anchor", async () => {
    const harness = await boot();
    const { submit } = harness.renderModal(EditNoteletCounterKeyModal, {
      props: { journalName: "Work", typeId: TYPE },
    });

    await submitValue("journal-date");

    await waitFor(() => {
      expect(screen.getByText(m.journal_property_key_taken({ name: "journal-date" }))).toBeTruthy();
    });
    expect(submit).not.toHaveBeenCalled();
  });

  it("refuses the type key, which carries the type name", async () => {
    const harness = await boot();
    const { submit } = harness.renderModal(EditNoteletCounterKeyModal, {
      props: { journalName: "Work", typeId: TYPE },
    });

    await submitValue("journal-notelet");

    await waitFor(() => {
      expect(screen.getByText(m.journal_property_key_taken({ name: "journal-notelet" }))).toBeTruthy();
    });
    expect(submit).not.toHaveBeenCalled();
  });

  it("refuses a key one of this type's own questions already writes", async () => {
    const harness = await boot();
    const { submit } = harness.renderModal(EditNoteletCounterKeyModal, {
      props: { journalName: "Work", typeId: TYPE },
    });

    await submitValue("standup-mood");

    await waitFor(() => {
      expect(screen.getByText(m.journal_property_key_taken({ name: "standup-mood" }))).toBeTruthy();
    });
    expect(submit).not.toHaveBeenCalled();
  });

  it("accepts a key the journal's own numbering digit writes, which a notelet never carries", async () => {
    const harness = await boot(
      workWith({
        numbering: {
          enabled: true,
          anchorDate: "2026-01-01" as never,
          allowBefore: false,
          sources: [{ variable: "index", frontmatterKey: "journal-index", anchorValue: 1, reset: { kind: "never" } }],
        },
      }),
    );
    const { submit } = harness.renderModal(EditNoteletCounterKeyModal, {
      props: { journalName: "Work", typeId: TYPE },
    });

    await submitValue("journal-index");

    await waitFor(() => {
      expect(submit).toHaveBeenCalledWith({ newValue: "journal-index" });
    });
  });

  it("accepts a key the journal's own question writes, which a notelet never carries", async () => {
    const harness = await boot(workWith({ prompts: [{ ...moodPrompt, frontmatterKey: "journal-mood" }] }));
    const { submit } = harness.renderModal(EditNoteletCounterKeyModal, {
      props: { journalName: "Work", typeId: TYPE },
    });

    await submitValue("journal-mood");

    await waitFor(() => {
      expect(submit).toHaveBeenCalledWith({ newValue: "journal-mood" });
    });
  });

  it("cancels when the user clicks Cancel", async () => {
    const harness = await boot();
    const { cancel } = harness.renderModal(EditNoteletCounterKeyModal, {
      props: { journalName: "Work", typeId: TYPE },
    });

    await userEvent.click(screen.getByText(m.common_action_cancel()));

    expect(cancel).toHaveBeenCalledTimes(1);
  });
});
