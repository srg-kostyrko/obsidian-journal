import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { defineComponent, h, ref } from "vue";

import type { AnchorString } from "@/calendar/types";
import { m } from "@/i18n";
import { Flows } from "@/infrastructure/flows";
import type { VaultPath } from "@/infrastructure/host";
import { AsyncResult } from "@/infrastructure/result";
import { JournalsIndex, OpenDateFlow, type JournalConfig } from "@/journals";
import { journalsCoreModule } from "@/journals/module";
import { fixedJournal } from "@/journals/testing";
import { notesCalendarModule } from "@/notes-calendar/module";
import { shelvesCoreModule } from "@/shelves/module";
import { testContainer } from "@/testing";
import { viewsCoreModule } from "@/views/module";

import { provideViewContextStub } from "../../../testing";
import { provideViewContext, type ViewContext } from "../../../view-context";
import { existingNavigationConfigFor } from "../existing-navigation-config";
import { existingNavigationItem } from "../existing-navigation-item";

import type { BlockInstanceId } from "../../../config";
import type { ExistingNavigationConfig } from "../existing-navigation-config";

const DAILY: Record<string, JournalConfig> = { daily: fixedJournal("daily", { type: "day" }) };

const renderRoot = (config: ExistingNavigationConfig): ReturnType<typeof h> =>
  h(existingNavigationItem.component, { instanceId: "i-1" as BlockInstanceId, config });

async function mountItem(
  config: ExistingNavigationConfig,
  options: {
    journals?: Record<string, JournalConfig>;
    active?: { journalName: string; anchor: string } | null;
    entries?: readonly { journalName: string; anchor: string }[];
  } = {},
  contextOverride: Partial<ViewContext> = {},
) {
  const harness = await testContainer({
    modules: [journalsCoreModule, shelvesCoreModule, viewsCoreModule, notesCalendarModule],
    data: { journals: options.journals ?? {}, views: {} },
  });
  const flows = vi
    .spyOn(harness.resolve(Flows), "invoke")
    .mockReturnValue(AsyncResult.ok({ path: "x", created: false }));
  const index = harness.resolve(JournalsIndex);
  const entries = options.entries ?? [];
  for (const entry of entries) {
    index.register({
      journalName: entry.journalName,
      anchor: entry.anchor as AnchorString,
      path: `${entry.journalName}/${entry.anchor}.md` as VaultPath,
    });
  }
  if (options.active) {
    const path = `${options.active.journalName}/${options.active.anchor}.md` as VaultPath;
    harness.host.emitFileOpen(harness.host.putFile(path, ""));
  }
  const context = provideViewContextStub(contextOverride);
  const wrapperRender = (): ReturnType<typeof h> => renderRoot(config);
  const Wrapper = defineComponent({
    setup() {
      provideViewContext(context);
      return wrapperRender;
    },
  });
  const result = harness.render(Wrapper);
  return { harness, result, flows, notices: harness.notices };
}

describe("ExistingNavigationItem", () => {
  it("opens the nearest earlier existing note when the previous button is clicked", async () => {
    const { result, flows, notices } = await mountItem(
      { target: "day", direction: "previous" },
      {
        journals: DAILY,
        active: { journalName: "daily", anchor: "2030-03-12" },
        entries: [
          { journalName: "daily", anchor: "2030-03-10" },
          { journalName: "daily", anchor: "2030-03-12" },
        ],
      },
    );
    const button = result.container.querySelector<HTMLElement>("[data-direction='previous']");
    expect(button).not.toBeNull();
    await userEvent.click(button!);
    expect(flows.mock.calls).toHaveLength(1);
    expect(flows.mock.calls[0]?.[0]).toBe(OpenDateFlow);
    const parameters = flows.mock.calls[0]?.[1] as { anchor: string; existingOnly: boolean };
    expect(parameters.anchor).toBe("2030-03-10");
    expect(parameters.existingOnly).toBe(true);
    expect(notices.messages).toHaveLength(0);
  });

  it("disables the previous button when the target resolves no journals", async () => {
    const { result } = await mountItem({ target: "day", direction: "previous" });
    const button = result.container.querySelector<HTMLButtonElement>("[data-direction='previous']");
    expect(button?.disabled).toBe(true);
  });

  it("shows a notice when no earlier note exists", async () => {
    const { result, flows, notices } = await mountItem(
      { target: "day", direction: "previous" },
      { journals: DAILY, entries: [] },
    );
    const button = result.container.querySelector<HTMLElement>("[data-direction='previous']");
    expect(button).not.toBeNull();
    await userEvent.click(button!);
    expect(flows.mock.calls).toHaveLength(0);
    expect(notices.messages).toContain(m.command_open_no_previous());
  });

  it("opens the nearest later existing note when the next button is clicked", async () => {
    const { result, flows, notices } = await mountItem(
      { target: "day", direction: "next" },
      {
        journals: DAILY,
        active: { journalName: "daily", anchor: "2030-03-10" },
        entries: [
          { journalName: "daily", anchor: "2030-03-10" },
          { journalName: "daily", anchor: "2030-03-12" },
        ],
      },
    );
    const button = result.container.querySelector<HTMLElement>("[data-direction='next']");
    expect(button).not.toBeNull();
    await userEvent.click(button!);
    expect(flows.mock.calls).toHaveLength(1);
    expect(flows.mock.calls[0]?.[0]).toBe(OpenDateFlow);
    const parameters = flows.mock.calls[0]?.[1] as { anchor: string; existingOnly: boolean };
    expect(parameters.anchor).toBe("2030-03-12");
    expect(parameters.existingOnly).toBe(true);
    expect(notices.messages).toHaveLength(0);
  });

  it("shows a notice when no later note exists", async () => {
    const { result, flows, notices } = await mountItem(
      { target: "day", direction: "next" },
      { journals: DAILY, entries: [] },
    );
    const button = result.container.querySelector<HTMLElement>("[data-direction='next']");
    expect(button).not.toBeNull();
    await userEvent.click(button!);
    expect(flows.mock.calls).toHaveLength(0);
    expect(notices.messages).toContain(m.command_open_no_next());
  });

  it("navigates within only the active journal when the target is active", async () => {
    const { result, flows } = await mountItem(
      { target: "active", direction: "next" },
      {
        active: { journalName: "daily", anchor: "2030-03-10" },
        entries: [
          { journalName: "daily", anchor: "2030-03-10" },
          { journalName: "daily", anchor: "2030-03-14" },
          { journalName: "work", anchor: "2030-03-11" },
        ],
      },
    );
    const button = result.container.querySelector<HTMLElement>("[data-direction='next']");
    expect(button).not.toBeNull();
    await userEvent.click(button!);
    const parameters = flows.mock.calls[0]?.[1] as { anchor: string };
    expect(parameters.anchor).toBe("2030-03-14");
  });

  it("disables the button when the target is active and no journal note is open", async () => {
    const { result } = await mountItem({ target: "active", direction: "next" });
    const button = result.container.querySelector<HTMLButtonElement>("[data-direction='next']");
    expect(button?.disabled).toBe(true);
  });

  it("renders the seeded chevron label", async () => {
    const { result } = await mountItem(existingNavigationConfigFor("day", "next"));
    expect(result.getByText("›")).toBeTruthy();
  });

  it("renders a custom label in place of the chevron", async () => {
    const { result } = await mountItem({ ...existingNavigationConfigFor("day", "next"), label: "Older" });
    expect(result.getByText("Older")).toBeTruthy();
  });

  it("renders no chevron when the label is cleared", async () => {
    const { result } = await mountItem({ ...existingNavigationConfigFor("day", "next"), label: "" });
    expect(result.queryByText("›")).toBeNull();
  });

  it("uses the seeded tooltip as the button aria-label", async () => {
    const { result } = await mountItem(existingNavigationConfigFor("day", "previous"));
    expect(result.getByLabelText(m.command_open_previous())).toBeTruthy();
  });

  it("uses a custom tooltip as the button aria-label", async () => {
    const { result } = await mountItem({ ...existingNavigationConfigFor("day", "next"), tooltip: "Jump back" });
    expect(result.getByLabelText("Jump back")).toBeTruthy();
  });

  it("omits the aria-label attribute when the tooltip is emptied", async () => {
    const { result } = await mountItem({ ...existingNavigationConfigFor("day", "next"), tooltip: "" });
    expect(result.getByRole("button").getAttribute("aria-label")).toBeNull();
  });

  it("searches from the view's date when no journal note is active", async () => {
    const { result, flows } = await mountItem(
      { target: "day", direction: "next" },
      {
        journals: DAILY,
        active: null,
        entries: [
          { journalName: "daily", anchor: "2030-03-10" },
          { journalName: "daily", anchor: "2030-03-20" },
        ],
      },
      { refDate: ref("2030-03-15" as AnchorString) },
    );

    await userEvent.click(result.getByRole("button"));

    expect(flows.mock.calls[0]?.[1]).toMatchObject({ anchor: "2030-03-20" });
  });
});
