import userEvent from "@testing-library/user-event";
import { cleanup, render } from "@testing-library/vue";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { computed, defineComponent, h, ref, shallowRef } from "vue";

import { installTestCalendar } from "@/calendar/testing";
import type { AnchorString } from "@/calendar/types";
import { m } from "@/i18n";
import { Container, provideInjectorOnApp } from "@/infrastructure/di";
import { Flows } from "@/infrastructure/flows";
import { NoticeService } from "@/infrastructure/host";
import type { VaultPath } from "@/infrastructure/host";
import { AsyncResult } from "@/infrastructure/result";
import { JournalsIndex, OpenDateFlow } from "@/journals";
import { ActiveEntryViewModel, type ActiveEntryRef } from "@/notes-calendar/active-entry";

import { provideViewContextStub } from "../../../testing";
import { provideViewContext, type ViewContext } from "../../../view-context";
import { existingNavigationConfigFor } from "../existing-navigation-config";
import { existingNavigationItem } from "../existing-navigation-item";

import type { BlockInstanceId } from "../../../config";
import type { ExistingNavigationConfig } from "../existing-navigation-config";

const SCOPE = {
  day: [] as readonly string[],
  week: [] as readonly string[],
  month: [] as readonly string[],
  quarter: [] as readonly string[],
  year: [] as readonly string[],
  custom: [] as readonly string[],
};

vi.mock("@/notes-calendar/use-shelf-scope", () => ({
  useShelfScope: () => ({
    all: computed<readonly string[]>(() => [
      ...SCOPE.day,
      ...SCOPE.week,
      ...SCOPE.month,
      ...SCOPE.quarter,
      ...SCOPE.year,
    ]),
    day: computed(() => SCOPE.day),
    week: computed(() => SCOPE.week),
    month: computed(() => SCOPE.month),
    quarter: computed(() => SCOPE.quarter),
    year: computed(() => SCOPE.year),
    custom: computed(() => SCOPE.custom),
  }),
}));

class FakeActiveEntryVM {
  active = shallowRef<ActiveEntryRef | null>(null);
}

class FakeFlows {
  calls: { flow: unknown; parameters: unknown }[] = [];
  invoke(flow: unknown, parameters: unknown) {
    this.calls.push({ flow, parameters });
    return AsyncResult.ok({ path: "x", created: false });
  }
}

class FakeNoticeService {
  messages: string[] = [];
  show(message: string): void {
    this.messages.push(message);
  }
}

const renderRoot = (config: ExistingNavigationConfig): ReturnType<typeof h> =>
  h(existingNavigationItem.component, { instanceId: "i-1" as BlockInstanceId, config });

function mountItem(
  config: ExistingNavigationConfig,
  options: { active?: ActiveEntryRef | null; entries?: readonly { journalName: string; anchor: string }[] } = {},
  contextOverride: Partial<ViewContext> = {},
) {
  const container = new Container();
  const activeVM = new FakeActiveEntryVM();
  if (options.active !== undefined) activeVM.active.value = options.active;
  const flows = new FakeFlows();
  const notices = new FakeNoticeService();
  const index = new JournalsIndex();
  const entries = options.entries ?? [];
  for (const entry of entries) {
    index.register({
      journalName: entry.journalName,
      anchor: entry.anchor as AnchorString,
      path: `${entry.journalName}/${entry.anchor}.md` as VaultPath,
    });
  }
  container.register(ActiveEntryViewModel).useValue(activeVM as unknown as ActiveEntryViewModel);
  container.register(Flows).useValue(flows as unknown as Flows);
  container.register(NoticeService).useValue(notices);
  container.register(JournalsIndex).useValue(index);
  const context = provideViewContextStub(contextOverride);
  const wrapperRender = (): ReturnType<typeof h> => renderRoot(config);
  const Wrapper = defineComponent({
    setup() {
      provideViewContext(context);
      return wrapperRender;
    },
  });
  const result = render(Wrapper, {
    global: { plugins: [{ install: (app) => provideInjectorOnApp(app, container) }] },
  });
  return { result, flows, notices };
}

beforeAll(() => {
  installTestCalendar();
});

afterEach(() => {
  cleanup();
  SCOPE.day = SCOPE.week = SCOPE.month = SCOPE.quarter = SCOPE.year = SCOPE.custom = [];
});

describe("ExistingNavigationItem", () => {
  it("opens the nearest earlier existing note when the previous button is clicked", async () => {
    SCOPE.day = ["daily"];
    const { result, flows, notices } = mountItem(
      { target: "day", direction: "previous" },
      {
        active: { journalName: "daily", anchor: "2030-03-12" as AnchorString },
        entries: [
          { journalName: "daily", anchor: "2030-03-10" },
          { journalName: "daily", anchor: "2030-03-12" },
        ],
      },
    );
    const button = result.container.querySelector<HTMLElement>("[data-direction='previous']");
    expect(button).not.toBeNull();
    await userEvent.click(button!);
    expect(flows.calls).toHaveLength(1);
    expect(flows.calls[0]?.flow).toBe(OpenDateFlow);
    const parameters = flows.calls[0]?.parameters as { anchor: string; existingOnly: boolean };
    expect(parameters.anchor).toBe("2030-03-10");
    expect(parameters.existingOnly).toBe(true);
    expect(notices.messages).toHaveLength(0);
  });

  it("disables the previous button when the target resolves no journals", () => {
    const { result } = mountItem({ target: "day", direction: "previous" });
    const button = result.container.querySelector<HTMLButtonElement>("[data-direction='previous']");
    expect(button?.disabled).toBe(true);
  });

  it("shows a notice when no earlier note exists", async () => {
    SCOPE.day = ["daily"];
    const { result, flows, notices } = mountItem({ target: "day", direction: "previous" }, { entries: [] });
    const button = result.container.querySelector<HTMLElement>("[data-direction='previous']");
    expect(button).not.toBeNull();
    await userEvent.click(button!);
    expect(flows.calls).toHaveLength(0);
    expect(notices.messages).toContain(m.command_open_no_previous());
  });

  it("opens the nearest later existing note when the next button is clicked", async () => {
    SCOPE.day = ["daily"];
    const { result, flows, notices } = mountItem(
      { target: "day", direction: "next" },
      {
        active: { journalName: "daily", anchor: "2030-03-10" as AnchorString },
        entries: [
          { journalName: "daily", anchor: "2030-03-10" },
          { journalName: "daily", anchor: "2030-03-12" },
        ],
      },
    );
    const button = result.container.querySelector<HTMLElement>("[data-direction='next']");
    expect(button).not.toBeNull();
    await userEvent.click(button!);
    expect(flows.calls).toHaveLength(1);
    expect(flows.calls[0]?.flow).toBe(OpenDateFlow);
    const parameters = flows.calls[0]?.parameters as { anchor: string; existingOnly: boolean };
    expect(parameters.anchor).toBe("2030-03-12");
    expect(parameters.existingOnly).toBe(true);
    expect(notices.messages).toHaveLength(0);
  });

  it("shows a notice when no later note exists", async () => {
    SCOPE.day = ["daily"];
    const { result, flows, notices } = mountItem({ target: "day", direction: "next" }, { entries: [] });
    const button = result.container.querySelector<HTMLElement>("[data-direction='next']");
    expect(button).not.toBeNull();
    await userEvent.click(button!);
    expect(flows.calls).toHaveLength(0);
    expect(notices.messages).toContain(m.command_open_no_next());
  });

  it("navigates within only the active journal when the target is active", async () => {
    const { result, flows } = mountItem(
      { target: "active", direction: "next" },
      {
        active: { journalName: "daily", anchor: "2030-03-10" as AnchorString },
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
    const parameters = flows.calls[0]?.parameters as { anchor: string };
    expect(parameters.anchor).toBe("2030-03-14");
  });

  it("disables the button when the target is active and no journal note is open", () => {
    const { result } = mountItem({ target: "active", direction: "next" });
    const button = result.container.querySelector<HTMLButtonElement>("[data-direction='next']");
    expect(button?.disabled).toBe(true);
  });

  it("renders the seeded chevron label", () => {
    const { result } = mountItem(existingNavigationConfigFor("day", "next"));
    expect(result.getByText("›")).toBeTruthy();
  });

  it("renders a custom label in place of the chevron", () => {
    const { result } = mountItem({ ...existingNavigationConfigFor("day", "next"), label: "Older" });
    expect(result.getByText("Older")).toBeTruthy();
  });

  it("renders no chevron when the label is cleared", () => {
    const { result } = mountItem({ ...existingNavigationConfigFor("day", "next"), label: "" });
    expect(result.queryByText("›")).toBeNull();
  });

  it("uses the seeded tooltip as the button aria-label", () => {
    const { result } = mountItem(existingNavigationConfigFor("day", "previous"));
    expect(result.getByLabelText(m.command_open_previous())).toBeTruthy();
  });

  it("uses a custom tooltip as the button aria-label", () => {
    const { result } = mountItem({ ...existingNavigationConfigFor("day", "next"), tooltip: "Jump back" });
    expect(result.getByLabelText("Jump back")).toBeTruthy();
  });

  it("omits the aria-label attribute when the tooltip is emptied", () => {
    const { result } = mountItem({ ...existingNavigationConfigFor("day", "next"), tooltip: "" });
    expect(result.getByRole("button").getAttribute("aria-label")).toBeNull();
  });

  it("searches from the view's date when no journal note is active", async () => {
    SCOPE.day = ["daily"];
    const { result, flows } = mountItem(
      { target: "day", direction: "next" },
      {
        active: null,
        entries: [
          { journalName: "daily", anchor: "2030-03-10" },
          { journalName: "daily", anchor: "2030-03-20" },
        ],
      },
      { refDate: ref("2030-03-15" as AnchorString) },
    );

    await userEvent.click(result.getByRole("button"));

    expect(flows.calls[0]?.parameters).toMatchObject({ anchor: "2030-03-20" });
  });
});
