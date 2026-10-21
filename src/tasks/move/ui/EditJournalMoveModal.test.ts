import userEvent from "@testing-library/user-event";
import { screen } from "@testing-library/vue";
import * as v from "valibot";
import { beforeAll, describe, expect, it } from "vitest";

import { initLocale, m } from "@/i18n";
import { testContainer } from "@/testing";

import { tasksCoreModule } from "../../module";
import { journalMoveSchema, type JournalMoveConfig, type MoveDefaults } from "../settings";

import EditJournalMoveModal from "./EditJournalMoveModal.vue";

async function mount(move: Partial<JournalMoveConfig> = {}, defaults?: MoveDefaults) {
  const harness = await testContainer({
    modules: [tasksCoreModule],
    ...(defaults !== undefined && { data: { tasksMove: defaults } }),
  });
  const { submit } = harness.renderModal<typeof EditJournalMoveModal, JournalMoveConfig>(EditJournalMoveModal, {
    props: { move: v.parse(journalMoveSchema, move) },
  });
  return { submit };
}

async function save(): Promise<void> {
  await userEvent.click(screen.getByText(m.common_action_submit()));
}

function submitted(submit: { mock: { calls: unknown[][] } }): JournalMoveConfig {
  const value = submit.mock.calls.at(-1)?.at(0);
  if (value === undefined) throw new Error("nothing was submitted");
  return value as JournalMoveConfig;
}

describe("EditJournalMoveModal", () => {
  beforeAll(() => initLocale("en"));

  it("choosing Default stores no mode", async () => {
    const { submit } = await mount({ mode: "move" });

    await userEvent.selectOptions(screen.getByTestId("move-mode"), "default");
    await save();

    expect(submitted(submit)).not.toHaveProperty("mode");
  });

  it("choosing Default stores no stamp", async () => {
    const { submit } = await mount({ stamp: false });

    await userEvent.selectOptions(screen.getByTestId("move-stamp"), "default");
    await save();

    expect(submitted(submit)).not.toHaveProperty("stamp");
  });

  it("stores an explicit mode and stamp the user picks", async () => {
    const { submit } = await mount();

    await userEvent.selectOptions(screen.getByTestId("move-mode"), "move");
    await userEvent.selectOptions(screen.getByTestId("move-stamp"), "off");
    await save();

    expect(submitted(submit)).toMatchObject({ mode: "move", stamp: false });
  });

  // The Default option has to say what it resolves to today, or "Default" and "Copy" read as the
  // same choice to a user whose global default is still copy.
  it("names the global default's current value on each Default option", async () => {
    await mount({}, { mode: "move", stamp: false });

    expect(screen.getByRole("option", { name: m.tasks_move_mode_default({ mode: "move" }) })).toBeTruthy();
    expect(screen.getByRole("option", { name: m.tasks_move_stamp_default({ stamp: "off" }) })).toBeTruthy();
  });

  it("look-back rejects 0 with an inline error", async () => {
    const { submit } = await mount();

    const lookBack = screen.getByTestId("move-look-back");
    await userEvent.clear(lookBack);
    await userEvent.type(lookBack, "0");

    expect(screen.getByText(m.tasks_move_look_back_invalid())).toBeTruthy();
    await save();
    expect(submit).not.toHaveBeenCalled();
  });

  it("look-back rejects an empty field with an inline error", async () => {
    const { submit } = await mount();

    await userEvent.clear(screen.getByTestId("move-look-back"));

    expect(screen.getByText(m.tasks_move_look_back_invalid())).toBeTruthy();
    await save();
    expect(submit).not.toHaveBeenCalled();
  });

  it("submits the source, the trimmed target heading and the look-back", async () => {
    const { submit } = await mount();

    await userEvent.selectOptions(screen.getByTestId("move-source"), "both");
    await userEvent.type(screen.getByTestId("move-heading"), "  Tasks  ");
    const lookBack = screen.getByTestId("move-look-back");
    await userEvent.clear(lookBack);
    await userEvent.type(lookBack, "3");
    await save();

    expect(submitted(submit)).toEqual({ source: "both", targetHeading: "Tasks", lookBack: 3, automatic: false });
  });

  // Placement matches a heading by its text, so the markdown hashes would make the setting match nothing.
  it('stores a target heading typed as "## Tasks" as its text', async () => {
    const { submit } = await mount();

    await userEvent.type(screen.getByTestId("move-heading"), "## Tasks");
    await save();

    expect(submitted(submit).targetHeading).toBe("Tasks");
  });

  it("automatic is disabled in copy without stamping", async () => {
    await mount({ mode: "copy", stamp: false });

    expect(screen.getByRole("checkbox", { name: m.tasks_move_automatic_label() }).getAttribute("aria-disabled")).toBe(
      "true",
    );
    expect(screen.getByText(m.tasks_move_automatic_needs_stamp())).toBeTruthy();
  });

  it("automatic follows the global default when the draft says Default", async () => {
    await mount({}, { mode: "copy", stamp: false });

    expect(screen.getByRole("checkbox", { name: m.tasks_move_automatic_label() }).getAttribute("aria-disabled")).toBe(
      "true",
    );
  });

  it("turning stamping off while automatic is on blocks save", async () => {
    const { submit } = await mount({ automatic: true });

    await userEvent.selectOptions(screen.getByTestId("move-stamp"), "off");

    expect(screen.getByText(m.tasks_move_automatic_needs_stamp()).className).toContain("tasks-move-form-error");
    await save();
    expect(submit).not.toHaveBeenCalled();
  });

  it("the automatic error clears once stamping is back on, and save goes through", async () => {
    const { submit } = await mount({ automatic: true });
    await userEvent.selectOptions(screen.getByTestId("move-stamp"), "off");
    expect(screen.getByText(m.tasks_move_automatic_needs_stamp())).toBeTruthy();

    await userEvent.selectOptions(screen.getByTestId("move-stamp"), "on");

    expect(screen.queryByText(m.tasks_move_automatic_needs_stamp())).toBeNull();
    await save();
    expect(submitted(submit)).toMatchObject({ automatic: true, stamp: true });
  });

  it("stores automatic when it is turned on", async () => {
    const { submit } = await mount();

    await userEvent.click(screen.getByRole("checkbox", { name: m.tasks_move_automatic_label() }));
    await save();

    expect(submitted(submit).automatic).toBe(true);
  });

  it("automatic stays switchable off while the mode blocks it", async () => {
    const { submit } = await mount({ automatic: true });
    await userEvent.selectOptions(screen.getByTestId("move-stamp"), "off");

    await userEvent.click(screen.getByRole("checkbox", { name: m.tasks_move_automatic_label() }));
    await save();

    expect(submitted(submit)).toMatchObject({ automatic: false, stamp: false });
  });
});
