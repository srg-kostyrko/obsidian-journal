import { cleanup, render } from "@testing-library/vue";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { defineComponent, ref, type ComputedRef } from "vue";

import type { AnchorString } from "@/calendar";
import { installTestCalendar } from "@/calendar/testing";
import { Container, provideInjectorOnApp } from "@/infrastructure/di";
import { LoggerModule } from "@/infrastructure/logger";
import { TemplateEngine } from "@/templates";
import { installTestEngine } from "@/templates/testing";

import { CycleService } from "../../cycle";
import { FrontmatterService } from "../../frontmatter";
import { JournalsIndex } from "../../journals-index";
import { NotePathService } from "../../notes/note-path";
import { NumberingService } from "../../numbering";
import { JournalsRepository } from "../../repository";
import { fakeRepo, fixedJournal } from "../../testing";
import { TimelineService } from "../../timeline";

import { useCollisionCheck } from "./use-collision-check";

import type { PathCollision } from "./name-template-collision";
import type { JournalConfig } from "../../config";

let teardown: () => void;
beforeEach(() => {
  ({ teardown } = installTestCalendar());
});
afterEach(() => {
  teardown();
  cleanup();
});

function buildContainer(config: JournalConfig): Container {
  const container = new Container();
  container.addModule(LoggerModule);
  container.register(JournalsRepository).useValue(fakeRepo({ [config.name]: config }));
  container.register(JournalsIndex).useClass(JournalsIndex);
  container.register(CycleService).useClass(CycleService);
  container.register(TimelineService).useClass(TimelineService);
  container.register(NumberingService).useClass(NumberingService);
  container.register(FrontmatterService).useClass(FrontmatterService);
  container.register(TemplateEngine).useValue(installTestEngine());
  container.register(NotePathService).useClass(NotePathService);
  return container;
}

function probe(config: JournalConfig): ComputedRef<PathCollision | null> {
  const container = buildContainer(config);
  let captured: ComputedRef<PathCollision | null> | undefined;
  const Probe = defineComponent({
    setup() {
      captured = useCollisionCheck(ref<JournalConfig | undefined>(config));
      return undefined;
    },
    template: "<div />",
  });
  render(Probe, {
    global: { plugins: [{ install: (app) => provideInjectorOnApp(app, container) }] },
  });
  if (!captured) throw new Error("probe did not capture the collision ref");
  return captured;
}

function dayJournal(overrides: Partial<JournalConfig> = {}): JournalConfig {
  return fixedJournal(
    "daily",
    { type: "day" },
    { timeline: { start: "2026-01-01" as AnchorString, end: { kind: "never" } }, ...overrides },
  );
}

describe("useCollisionCheck", () => {
  it("stays silent for a template whose date varies per period", () => {
    expect(probe(dayJournal()).value).toBeNull();
  });

  it("flags a template whose boundary modifier collapses the date", () => {
    const collision = probe(dayJournal({ nameTemplate: "{{date<endOf=month>}}" })).value;
    expect(collision).toMatchObject({ first: "2026-01-01", second: "2026-01-02" });
  });

  it("flags a template whose shift and boundary collapse the date", () => {
    const collision = probe(dayJournal({ nameTemplate: "{{date+1w<endOf=month>:YYYY-MM-DD}}" })).value;
    expect(collision).not.toBeNull();
  });

  it("flags a template whose inline format is coarser than the period", () => {
    const collision = probe(dayJournal({ nameTemplate: "{{date:YYYY-MM}}" })).value;
    expect(collision).toMatchObject({ path: "2026-01.md" });
  });

  it("flags a plain date variable when the journal's own date format is coarser than the period", () => {
    const collision = probe(dayJournal({ nameTemplate: "{{date}}", dateFormat: "YYYY-MM" })).value;
    expect(collision).toMatchObject({ path: "2026-01.md" });
  });

  it("flags a template with no date variable at all", () => {
    const collision = probe(dayJournal({ nameTemplate: "MyNote" })).value;
    expect(collision).toMatchObject({ path: "MyNote.md" });
  });

  it("stays silent when the folder disambiguates a coarse name", () => {
    const config = dayJournal({ nameTemplate: "{{date:YYYY-MM}}", folder: "Journal/{{date:DD}}" });
    expect(probe(config).value).toBeNull();
  });

  it("stays silent for an empty name template", () => {
    expect(probe(dayJournal({ nameTemplate: "" })).value).toBeNull();
  });

  it("stays silent when the timeline ends before the colliding period", () => {
    const config = dayJournal({
      nameTemplate: "{{date<endOf=month>}}",
      timeline: { start: "2026-01-01" as AnchorString, end: { kind: "repeats", count: 1 } },
    });
    expect(probe(config).value).toBeNull();
  });
});
