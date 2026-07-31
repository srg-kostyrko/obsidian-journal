import { render } from "@testing-library/vue";
import { createNanoEvents } from "nanoevents";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { defineComponent, h, reactive } from "vue";

import { installTestCalendar } from "@/calendar/testing";
import { Container, provideInjectorOnApp } from "@/infrastructure/di";
import { JournalsRepository, JournalsViewModel } from "@/journals";
import type { JournalsEvents } from "@/journals";
import { customJournal, fixedJournal } from "@/journals/testing";
import { ShelvesEventsToken, ShelvesRepository } from "@/shelves";
import type { ShelfConfig, ShelvesEvents } from "@/shelves";

import { useShelfScope, type ShelfScope } from "./use-shelf-scope";

interface Harness {
  c: Container;
  journals: Record<string, ReturnType<typeof fixedJournal>>;
  shelves: Record<string, ShelfConfig>;
}

function build(journals: Harness["journals"] = {}, shelves: Harness["shelves"] = {}): Harness {
  const c = new Container();
  const reactiveJournals = reactive({ ...journals });
  const journalsEvents = createNanoEvents<JournalsEvents>();
  c.register(JournalsRepository).useValue(JournalsRepository.fromParts(reactiveJournals, journalsEvents));
  c.register(JournalsViewModel).useClass(JournalsViewModel);
  const reactiveShelves = reactive({ ...shelves });
  const shelvesEvents = createNanoEvents<ShelvesEvents>();
  c.register(ShelvesEventsToken).useValue(shelvesEvents);
  c.register(ShelvesRepository).useValue(ShelvesRepository.fromParts(reactiveShelves, shelvesEvents));
  return { c, journals: reactiveJournals, shelves: reactiveShelves };
}

function renderDiv() {
  return h("div");
}

function mountAndCapture(c: Container, shelfName: () => string | null): { scope: ShelfScope; unmount: () => void } {
  let captured: ShelfScope | null = null;
  const Host = defineComponent({
    setup() {
      captured = useShelfScope(shelfName);
      return renderDiv;
    },
  });
  const utilities = render(Host, {
    global: {
      plugins: [
        {
          install(app) {
            provideInjectorOnApp(app, c);
          },
        },
      ],
    },
  });
  if (!captured) throw new Error("scope not captured");
  return { scope: captured, unmount: () => utilities.unmount() };
}

describe("useShelfScope", () => {
  let teardown: () => void;
  beforeEach(() => {
    ({ teardown } = installTestCalendar());
  });
  afterEach(() => {
    teardown();
  });

  it("returns every journal partitioned by write type when shelf is null", () => {
    const { c } = build({
      daily: fixedJournal("daily", { type: "day" }),
      weekly: fixedJournal("weekly", { type: "week" }),
      custom1: customJournal("custom1", "day", 3, "2026-01-01"),
    });

    const { scope } = mountAndCapture(c, () => null);

    expect([...scope.all.value]).toEqual(["daily", "weekly", "custom1"]);
    expect([...scope.day.value]).toEqual(["daily"]);
    expect([...scope.week.value]).toEqual(["weekly"]);
    expect([...scope.custom.value]).toEqual(["custom1"]);
    expect([...scope.month.value]).toEqual([]);
  });

  it("excludes custom-interval journals from the fixed bucket", () => {
    const { c } = build({
      daily: fixedJournal("daily", { type: "day" }),
      weekly: fixedJournal("weekly", { type: "week" }),
      custom1: customJournal("custom1", "day", 3, "2026-01-01"),
    });

    const { scope } = mountAndCapture(c, () => null);

    expect([...scope.fixed.value]).toEqual(["daily", "weekly"]);
  });

  it("filters journals to those listed by the named shelf", () => {
    const { c } = build(
      {
        daily: fixedJournal("daily", { type: "day" }),
        weekly: fixedJournal("weekly", { type: "week" }),
        monthly: fixedJournal("monthly", { type: "month" }),
      },
      {
        work: { name: "work", journals: ["daily", "weekly"], decorations: [] },
      },
    );

    const { scope } = mountAndCapture(c, () => "work");

    expect([...scope.all.value]).toEqual(["daily", "weekly"]);
    expect([...scope.month.value]).toEqual([]);
  });

  it("returns empty buckets when the shelf name is unknown", () => {
    const { c } = build({ daily: fixedJournal("daily", { type: "day" }) });

    const { scope } = mountAndCapture(c, () => "missing");

    expect([...scope.all.value]).toEqual([]);
    expect([...scope.day.value]).toEqual([]);
  });

  it("re-computes when a journal is added to the underlying repository", async () => {
    const { c, journals } = build({ daily: fixedJournal("daily", { type: "day" }) });

    const { scope } = mountAndCapture(c, () => null);
    expect([...scope.day.value]).toEqual(["daily"]);

    journals.morning = fixedJournal("morning", { type: "day" });
    await Promise.resolve();
    expect([...scope.day.value]).toEqual(["daily", "morning"]);
  });
});
