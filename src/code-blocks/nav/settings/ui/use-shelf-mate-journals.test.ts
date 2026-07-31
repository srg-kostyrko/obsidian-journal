import { cleanup, render } from "@testing-library/vue";
import { createNanoEvents } from "nanoevents";
import { afterEach, describe, expect, it } from "vitest";
import { defineComponent, h, reactive } from "vue";

import { Container, provideInjectorOnApp } from "@/infrastructure/di";
import {
  JournalsRepository,
  JournalsViewModel,
  journalDefaultsFor,
  type JournalConfig,
  type JournalsEvents,
} from "@/journals";
import { ShelvesRepository, type ShelfConfig, type ShelvesEvents } from "@/shelves";

import { useShelfMateJournals } from "./use-shelf-mate-journals";

afterEach(() => cleanup());

function mount(options: {
  journalName: string;
  journals: Record<string, JournalConfig>;
  shelves: Record<string, ShelfConfig>;
}) {
  const container = new Container();
  const journalsStorage = reactive(options.journals);
  const shelvesStorage = reactive(options.shelves);
  const repo = JournalsRepository.fromParts(journalsStorage, createNanoEvents<JournalsEvents>());
  const shelvesRepo = ShelvesRepository.fromParts(shelvesStorage, createNanoEvents<ShelvesEvents>());
  container.register(JournalsRepository).useValue(repo);
  container.register(JournalsViewModel).useValue(JournalsViewModel.fromRepository(repo));
  container.register(ShelvesRepository).useValue(shelvesRepo);

  let result: readonly string[] = [];
  const Probe = defineComponent({
    setup() {
      const list = useShelfMateJournals(options.journalName);
      return () => {
        result = list.value;
        return h("div");
      };
    },
  });

  render(Probe, {
    global: {
      plugins: [
        {
          install(app) {
            provideInjectorOnApp(app, container);
          },
        },
      ],
    },
  });
  return () => result;
}

const journal = (name: string): JournalConfig => journalDefaultsFor({ type: "day" }, name);

describe("useShelfMateJournals", () => {
  it("returns shelf-mates excluding the current journal", () => {
    const get = mount({
      journalName: "daily",
      journals: { daily: journal("daily"), weekly: journal("weekly"), other: journal("other") },
      shelves: { home: { name: "home", journals: ["daily", "weekly"], decorations: [] } },
    });
    expect(get()).toEqual(["weekly"]);
  });

  it("returns empty when the journal is not in any shelf", () => {
    const get = mount({
      journalName: "daily",
      journals: { daily: journal("daily"), weekly: journal("weekly") },
      shelves: { home: { name: "home", journals: ["weekly"], decorations: [] } },
    });
    expect(get()).toEqual([]);
  });

  it("returns empty when no shelves exist", () => {
    const get = mount({
      journalName: "daily",
      journals: { daily: journal("daily") },
      shelves: {},
    });
    expect(get()).toEqual([]);
  });
});
