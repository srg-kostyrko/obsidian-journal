import userEvent from "@testing-library/user-event";
import { screen, waitFor } from "@testing-library/vue";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { nextTick } from "vue";

import { commandsCoreModule } from "@/commands/module";
import { m } from "@/i18n";
import { Flows } from "@/infrastructure/flows";
import { AsyncResult } from "@/infrastructure/result";
import { journalsCoreModule } from "@/journals/module";
import type { TypeId } from "@/journals/notelets/config";
import { JournalsRepository } from "@/journals/repository";
import { buildNoteletType, fixedJournal } from "@/journals/testing";
import type { SubpageNav } from "@/settings";
import { testContainer, type TestHarness } from "@/testing";

import { DeleteNoteletTypeFlow } from "../flows/delete-notelet-type.flow";
import { RenameNoteletTypeFlow } from "../flows/rename-notelet-type.flow";

import NoteletTypeSubpage from "./NoteletTypeSubpage.vue";

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-05-19T12:00:00"));
});
afterEach(() => {
  vi.useRealTimers();
});

const noopNav: SubpageNav<{ journalName: string; typeId: string }> = {
  back: () => undefined,
  push: () => undefined,
  replace: () => undefined,
};

async function setup(): Promise<TestHarness> {
  return testContainer({
    modules: [journalsCoreModule, commandsCoreModule],
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
}

describe("NoteletTypeSubpage", () => {
  it("heads the page with the type's name", async () => {
    const harness = await setup();

    harness.render(NoteletTypeSubpage, { props: { journalName: "Work", typeId: "nt_7f3a", nav: noopNav } });

    expect(screen.getByText("Standup")).toBeTruthy();
  });

  it("renders the note creation, templates and questions sections", async () => {
    const harness = await setup();

    harness.render(NoteletTypeSubpage, { props: { journalName: "Work", typeId: "nt_7f3a", nav: noopNav } });

    expect(screen.getByText(m.journal_edit_section_note_creation())).toBeTruthy();
    expect(screen.getByText(m.journal_edit_section_templates())).toBeTruthy();
    expect(screen.getByText(m.journal_prompt_section_title())).toBeTruthy();
  });

  it("invokes the rename flow from the heading's edit button", async () => {
    const harness = await setup();
    const flows = harness.resolve(Flows);
    vi.spyOn(flows, "invoke").mockReturnValue(AsyncResult.ok(undefined));
    harness.render(NoteletTypeSubpage, { props: { journalName: "Work", typeId: "nt_7f3a", nav: noopNav } });

    await userEvent.click(screen.getByLabelText(m.journal_notelet_rename_tooltip()));

    expect(flows.invoke).toHaveBeenCalledWith(RenameNoteletTypeFlow, { journalName: "Work", typeId: "nt_7f3a" });
  });

  it("invokes the delete flow from the heading's delete button", async () => {
    const harness = await setup();
    const flows = harness.resolve(Flows);
    vi.spyOn(flows, "invoke").mockReturnValue(AsyncResult.ok(undefined));
    harness.render(NoteletTypeSubpage, { props: { journalName: "Work", typeId: "nt_7f3a", nav: noopNav } });

    await userEvent.click(screen.getByLabelText(m.journal_notelet_delete_tooltip()));

    expect(flows.invoke).toHaveBeenCalledWith(DeleteNoteletTypeFlow, { journalName: "Work", typeId: "nt_7f3a" });
  });

  it("leaves out the journal's own sections", async () => {
    const harness = await setup();

    harness.render(NoteletTypeSubpage, { props: { journalName: "Work", typeId: "nt_7f3a", nav: noopNav } });

    expect(screen.queryByText(m.journal_edit_section_timeline())).toBeNull();
    expect(screen.queryByText(m.journal_edit_section_frontmatter())).toBeNull();
  });

  it("goes back when the type disappears from the journal", async () => {
    const harness = await setup();
    const back = vi.fn();
    harness.render(NoteletTypeSubpage, {
      props: {
        journalName: "Work",
        typeId: "nt_7f3a",
        nav: { back, push: () => undefined, replace: () => undefined },
      },
    });

    harness.resolve(JournalsRepository).update("Work", { notelets: {} });

    await waitFor(() => {
      expect(back).toHaveBeenCalled();
    });
  });

  // The route key carries the journal's name, which a rename makes stale — the missing-type
  // guard would then read that as a deletion and pop the page.
  it("follows the journal's new name instead of popping the page", async () => {
    const harness = await setup();
    const back = vi.fn();
    const nav: SubpageNav<{ journalName: string; typeId: string }> = {
      back,
      push: () => undefined,
      // The dashboard re-renders the subpage with the frame's replaced props; stand in for it.
      replace: (props) => void utilities.rerender(props),
    };
    const utilities = harness.render(NoteletTypeSubpage, {
      props: { journalName: "Work", typeId: "nt_7f3a", nav },
    });

    harness.resolve(JournalsRepository).rename("Work", "Job");

    await nextTick();
    await nextTick();
    expect(back).not.toHaveBeenCalled();
    expect(screen.getByText("Standup")).toBeTruthy();
  });

  it("stays open while the type is renamed, because the route is keyed by id", async () => {
    const harness = await setup();
    const back = vi.fn();
    harness.render(NoteletTypeSubpage, {
      props: {
        journalName: "Work",
        typeId: "nt_7f3a",
        nav: { back, push: () => undefined, replace: () => undefined },
      },
    });

    harness.resolve(JournalsRepository).update("Work", {
      notelets: { nt_7f3a: buildNoteletType({ id: "nt_7f3a" as TypeId, name: "Retro" }) },
    });

    await waitFor(() => expect(screen.getByText("Retro")).toBeTruthy());
    expect(back).not.toHaveBeenCalled();
  });
});
