import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { AnchorString } from "@/calendar";
import { installTestCalendar } from "@/calendar/testing";
import { Container } from "@/infrastructure/di";
import type { VaultPath } from "@/infrastructure/host";
import { SettingsService } from "@/settings";

import { CycleService } from "./cycle";
import { JournalsIndex } from "./journals-index";
import { NumberingService } from "./numbering";
import { customJournal, fakeSettings, fixedJournal, unwrap } from "./testing";

function buildContainer(journals: Parameters<typeof fakeSettings>[0]): Container {
  const c = new Container();
  c.register(SettingsService).useValue(fakeSettings(journals));
  c.register(JournalsIndex).useClass(JournalsIndex);
  c.register(CycleService).useClass(CycleService);
  c.register(NumberingService).useClass(NumberingService);
  return c;
}

describe("NumberingService", () => {
  let teardown: () => void;
  beforeEach(() => {
    ({ teardown } = installTestCalendar());
  });
  afterEach(() => {
    teardown();
  });

  describe("assignNumbers — single source", () => {
    it("returns None when enabled is false", () => {
      const c = buildContainer({ w: fixedJournal("w", { type: "week" }) });
      const n = c.resolve(NumberingService);
      expect(n.assignNumbers("w", "2024-01-01" as AnchorString).isNone()).toBe(true);
    });

    it("returns None for unknown journal", () => {
      const c = buildContainer({});
      const n = c.resolve(NumberingService);
      expect(n.assignNumbers("missing", "2024-01-01" as AnchorString).isNone()).toBe(true);
    });

    it("returns anchorValue at the anchorDate for reset.never", () => {
      const c = buildContainer({ s: customJournal("s", "week", 1, "2024-01-01") });
      const n = c.resolve(NumberingService);
      const result = n.assignNumbers("s", "2024-01-01" as AnchorString);
      expect(result.isSome() && result.value).toEqual({ index: 1 });
    });

    it("returns monotonically increasing values for reset.never", () => {
      const c = buildContainer({ s: customJournal("s", "week", 1, "2024-01-01") });
      const n = c.resolve(NumberingService);
      const result = n.assignNumbers("s", "2024-01-15" as AnchorString);
      expect(result.isSome() && result.value).toEqual({ index: 3 });
    });

    it("returns None for anchor before anchorDate when allowBefore is false", () => {
      const c = buildContainer({ s: customJournal("s", "week", 1, "2024-01-15") });
      const n = c.resolve(NumberingService);
      expect(n.assignNumbers("s", "2024-01-01" as AnchorString).isNone()).toBe(true);
    });

    it("cycles values for reset.after { count: 3 }", () => {
      const c = buildContainer({
        s: customJournal("s", "week", 1, "2024-01-01", {
          numbering: {
            enabled: true,
            anchorDate: "2024-01-01" as AnchorString,
            allowBefore: false,
            sources: [
              {
                variable: "index",
                frontmatterKey: "journal-index",
                anchorValue: 1,
                reset: { kind: "after", count: 3 },
              },
            ],
          },
        }),
      });
      const n = c.resolve(NumberingService);
      expect(unwrap(n.assignNumbers("s", "2024-01-01" as AnchorString))).toEqual({ index: 1 });
      expect(unwrap(n.assignNumbers("s", "2024-01-08" as AnchorString))).toEqual({ index: 2 });
      expect(unwrap(n.assignNumbers("s", "2024-01-15" as AnchorString))).toEqual({ index: 3 });
      expect(unwrap(n.assignNumbers("s", "2024-01-22" as AnchorString))).toEqual({ index: 1 });
    });
  });

  describe("assignNumbers — multi-source cascade", () => {
    it("release stays at anchorValue for 6 sprints, then advances", () => {
      const c = buildContainer({
        s: customJournal("s", "week", 1, "2024-01-01", {
          numbering: {
            enabled: true,
            anchorDate: "2024-01-01" as AnchorString,
            allowBefore: false,
            sources: [
              { variable: "release", frontmatterKey: "journal-release", anchorValue: 4711, reset: { kind: "never" } },
              {
                variable: "sprint",
                frontmatterKey: "journal-sprint",
                anchorValue: 1,
                reset: { kind: "after", count: 6 },
              },
            ],
          },
        }),
      });
      const n = c.resolve(NumberingService);
      expect(unwrap(n.assignNumbers("s", "2024-01-01" as AnchorString))).toEqual({ release: 4711, sprint: 1 });
      expect(unwrap(n.assignNumbers("s", "2024-01-29" as AnchorString))).toEqual({ release: 4711, sprint: 5 });
      expect(unwrap(n.assignNumbers("s", "2024-02-05" as AnchorString))).toEqual({ release: 4711, sprint: 6 });
      expect(unwrap(n.assignNumbers("s", "2024-02-12" as AnchorString))).toEqual({ release: 4712, sprint: 1 });
    });

    it("outer source stays at anchorValue when inner reset is never", () => {
      const c = buildContainer({
        s: customJournal("s", "week", 1, "2024-01-01", {
          numbering: {
            enabled: true,
            anchorDate: "2024-01-01" as AnchorString,
            allowBefore: false,
            sources: [
              { variable: "phase", frontmatterKey: "journal-phase", anchorValue: 1, reset: { kind: "never" } },
              { variable: "n", frontmatterKey: "journal-n", anchorValue: 1, reset: { kind: "never" } },
            ],
          },
        }),
      });
      const n = c.resolve(NumberingService);
      expect(unwrap(n.assignNumbers("s", "2024-01-29" as AnchorString))).toEqual({ phase: 1, n: 5 });
    });
  });

  describe("assignNumbers — stored-basis", () => {
    it("uses stored numbers as cascade basis when an earlier entry has them", () => {
      const c = buildContainer({ s: customJournal("s", "week", 1, "2020-01-06") });

      const fresh = c.resolve(NumberingService);
      const computed = unwrap(fresh.assignNumbers("s", "2024-01-08" as AnchorString));
      expect(computed.index).toBeGreaterThan(200);

      const c2 = buildContainer({ s: customJournal("s", "week", 1, "2020-01-06") });
      const index2 = c2.resolve(JournalsIndex);
      index2.register({
        journalName: "s",
        anchor: "2024-01-01" as AnchorString,
        path: "S/X.md" as VaultPath,
        numbers: { index: 200 },
      });
      const n2 = c2.resolve(NumberingService);
      const withBasis = unwrap(n2.assignNumbers("s", "2024-01-08" as AnchorString));
      expect(withBasis).toEqual({ index: 201 });
    });
  });
});
