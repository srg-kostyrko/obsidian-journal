import userEvent from "@testing-library/user-event";
import { cleanup, render } from "@testing-library/vue";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { computed, defineComponent, h, ref, shallowRef } from "vue";

import { installTestCalendar } from "@/calendar/testing";
import type { AnchorString } from "@/calendar/types";
import { Container, provideInjectorOnApp } from "@/infrastructure/di";
import { Flows } from "@/infrastructure/flows";
import { AsyncResult } from "@/infrastructure/result";
import { OpenDateFlow } from "@/journals";
import { ActiveEntryViewModel, type ActiveEntryRef } from "@/notes-calendar/active-entry";

import { provideViewContextStub } from "../../testing";
import { provideViewContext, type ViewContext } from "../../view-context";

import { periodButtonsItem, type PeriodButtonsConfig } from "./period-buttons-item";

import type { BlockInstanceId } from "../../config";

const SCOPE = {
  day: [] as readonly string[],
  week: [] as readonly string[],
  month: [] as readonly string[],
  quarter: [] as readonly string[],
  year: [] as readonly string[],
  custom: [] as readonly string[],
};

vi.mock("@/decorations", () => ({
  useCellDecorations: () => new Map(),
  CellDecoration: defineComponent({
    props: { period: { type: Object, required: true } },
    setup:
      (_props, { slots }) =>
      () =>
        h("span", slots.default?.()),
  }),
}));

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

const renderRoot = (config: PeriodButtonsConfig): ReturnType<typeof h> =>
  h(periodButtonsItem.component, { instanceId: "i-1" as BlockInstanceId, config });

function mountItem(
  config: PeriodButtonsConfig,
  contextOverride: Partial<ViewContext> = {},
  options: { active?: ActiveEntryRef | null } = {},
) {
  const container = new Container();
  const activeVM = new FakeActiveEntryVM();
  if (options.active !== undefined) activeVM.active.value = options.active;
  const flows = new FakeFlows();
  container.register(ActiveEntryViewModel).useValue(activeVM as unknown as ActiveEntryViewModel);
  container.register(Flows).useValue(flows as unknown as Flows);
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
  return { result, flows };
}

beforeAll(() => {
  installTestCalendar();
});

afterEach(() => {
  cleanup();
  SCOPE.day = SCOPE.week = SCOPE.month = SCOPE.quarter = SCOPE.year = SCOPE.custom = [];
});

describe("PeriodButtonsItem", () => {
  describe("rendering", () => {
    it("renders a journal-less month button rather than hiding it", () => {
      const { result } = mountItem({ week: false, month: true, quarter: false, year: false });
      expect(result.container.querySelector("[data-period='month']")).not.toBeNull();
    });

    it("renders a journal-less year button rather than hiding it", () => {
      const { result } = mountItem({ week: false, month: false, quarter: false, year: true });
      expect(result.container.querySelector("[data-period='year']")).not.toBeNull();
    });

    it("hides the quarter button when it has no journal", () => {
      const { result } = mountItem({ week: false, month: false, quarter: true, year: false });
      expect(result.container.querySelector("[data-period='quarter']")).toBeNull();
    });

    it("renders the quarter button when its scope has a journal", () => {
      SCOPE.quarter = ["quarterly"];
      const { result } = mountItem({ week: false, month: false, quarter: true, year: false });
      expect(result.container.querySelector("[data-period='quarter']")).not.toBeNull();
    });

    it("does not render periods turned off in config even when scope has journals", () => {
      SCOPE.month = ["monthly"];
      const { result } = mountItem({ week: false, month: false, quarter: false, year: false });
      expect(result.container.querySelectorAll("[data-period]").length).toBe(0);
    });
  });

  describe("active highlighting", () => {
    it("marks the matching badge active when active note's journal + anchor match the period", () => {
      SCOPE.month = ["monthly"];
      const { result } = mountItem(
        { week: false, month: true, quarter: false, year: false },
        { refDate: ref("2026-05-15" as AnchorString) },
        { active: { journalName: "monthly", anchor: "2026-05-01" as AnchorString } },
      );
      const badge = result.container.querySelector<HTMLElement>("[data-period='month']");
      expect(badge?.dataset.active).toBe("true");
    });

    it("does not mark active when the active note is in a different journal", () => {
      SCOPE.month = ["monthly"];
      const { result } = mountItem(
        { week: false, month: true, quarter: false, year: false },
        { refDate: ref("2026-05-15" as AnchorString) },
        { active: { journalName: "yearly", anchor: "2026-05-01" as AnchorString } },
      );
      const badge = result.container.querySelector<HTMLElement>("[data-period='month']");
      expect(badge?.dataset.active).toBeUndefined();
    });
  });

  describe("click", () => {
    it("invokes OpenDateFlow with the period's journals when a badge is clicked", async () => {
      SCOPE.month = ["monthly"];
      const { result, flows } = mountItem(
        { week: false, month: true, quarter: false, year: false },
        { refDate: ref("2026-05-15" as AnchorString) },
      );
      const badge = result.container.querySelector<HTMLElement>("[data-period='month']");
      expect(badge).not.toBeNull();
      await userEvent.click(badge!);
      expect(flows.calls).toHaveLength(1);
      expect(flows.calls[0]?.flow).toBe(OpenDateFlow);
      const parameters = flows.calls[0]?.parameters as { anchor: string; journalNames: readonly string[] };
      expect(parameters.anchor).toBe("2026-05-01");
      expect(parameters.journalNames).toEqual(["monthly"]);
    });

    it("does not open anything when a journal-less badge is clicked", async () => {
      const { result, flows } = mountItem({ week: false, month: true, quarter: false, year: false });
      const badge = result.container.querySelector<HTMLElement>("[data-period='month']");
      expect(badge).not.toBeNull();
      await userEvent.click(badge!);
      expect(flows.calls).toHaveLength(0);
    });
  });
});
