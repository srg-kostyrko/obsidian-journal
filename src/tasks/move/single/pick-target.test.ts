import { describe, expect, it } from "vitest";

import { DayPeriod } from "@/calendar";
import { anchor, date } from "@/calendar/testing";
import { m } from "@/i18n";
import { UserAborted } from "@/infrastructure/flows";
import type { VaultPath } from "@/infrastructure/host";
import type { Result } from "@/infrastructure/result";
import { expectErr, expectOk } from "@/infrastructure/result/testing";
import { JournalsIndex, type JournalConfig } from "@/journals";
import { JournalNotFoundError, NoJournalsError } from "@/journals/errors";
import { journalsCoreModule } from "@/journals/module";
import { customJournal, fixedJournal } from "@/journals/testing";
import { shelvesCoreModule } from "@/shelves/module";
import { testContainer } from "@/testing";

import { tasksCoreModule } from "../../module";

import { MoveTargetPicker } from "./pick-target";

import type { MoveTarget } from "./containing";

function okValue(result: Result<MoveTarget, unknown>): MoveTarget {
  expectOk(result);
  return result.value;
}

function errorOf(result: Result<MoveTarget, unknown>): unknown {
  expectErr(result);
  return result.error;
}

const tick = (): Promise<void> => new Promise((resolve) => window.setTimeout(resolve, 0));

async function setup(journals: readonly JournalConfig[]) {
  const harness = await testContainer({
    modules: [journalsCoreModule, shelvesCoreModule, tasksCoreModule],
    data: { journals: Object.fromEntries(journals.map((journal) => [journal.name, journal])) },
  });
  return { harness, index: harness.resolve(JournalsIndex), picker: harness.resolve(MoveTargetPicker) };
}

const month = (journalName: string, label: string, noteletTitle?: string): MoveTarget => ({
  journalName,
  anchor: anchor("2026-10-01"),
  path: `${journalName}/2026-10-01.md` as VaultPath,
  label,
  ...(noteletTitle !== undefined && { noteletTitle }),
});

describe("MoveTargetPicker.pickTarget", () => {
  it("a single target needs no picker", async () => {
    const { harness, picker } = await setup([]);
    const only = month("monthly", "October 2026");

    const result = await picker.pickTarget([only]);

    expect(okValue(result)).toEqual(only);
    expect(harness.suggests.opens).toHaveLength(0);
  });

  it("several targets open a suggest whose rows read label, notelet and journal", async () => {
    const { harness, picker } = await setup([]);
    const targets = [month("a", "October 2026"), month("a", "October 2026", "Retro"), month("b", "October 2026")];

    const promise = picker.pickTarget(targets);
    const open = harness.suggests.lastOpen<readonly MoveTarget[], MoveTarget>();
    const rows = targets.map((target) => open.definition.render(target, document.createElement("div")));

    expect(open.definition.placeholder?.(targets)).toBe(m.tasks_move_pick_target());
    expect(rows).toEqual([
      m.tasks_move_target_row({
        label: "October 2026",
        journal: "a",
        hasNotelet: "no",
        hasJournal: "yes",
        notelet: "",
      }),
      m.tasks_move_target_row({
        label: "October 2026",
        journal: "a",
        hasNotelet: "yes",
        hasJournal: "yes",
        notelet: "Retro",
      }),
      m.tasks_move_target_row({
        label: "October 2026",
        journal: "b",
        hasNotelet: "no",
        hasJournal: "yes",
        notelet: "",
      }),
    ]);
    open.choose(targets[1]);
    expect(okValue(await promise)).toEqual(targets[1]);
  });

  it("a period note and its notelet from one journal share a label without a journal suffix", async () => {
    const { harness, picker } = await setup([]);
    const targets = [month("a", "October 2026"), month("a", "October 2026", "Retro")];

    void picker.pickTarget(targets);
    const open = harness.suggests.lastOpen<readonly MoveTarget[], MoveTarget>();
    const rows = targets.map((target) => open.definition.render(target, document.createElement("div")));

    expect(rows).toEqual(["October 2026", "October 2026 · Retro"]);
  });

  it("composes the row text in English", async () => {
    const { harness, picker } = await setup([]);
    const targets = [month("a", "October 2026"), month("a", "October 2026", "Retro"), month("b", "October 2026")];

    void picker.pickTarget(targets);
    const open = harness.suggests.lastOpen<readonly MoveTarget[], MoveTarget>();
    const rows = targets.map((target) => open.definition.render(target, document.createElement("div")));

    expect(rows).toEqual(["October 2026 — a", "October 2026 · Retro — a", "October 2026 — b"]);
  });

  it("the journal is left off when every label is distinct", async () => {
    const { harness, picker } = await setup([]);
    const targets = [month("a", "October 2026"), { ...month("a", "Q4 2026") }];

    void picker.pickTarget(targets);
    const open = harness.suggests.lastOpen<readonly MoveTarget[], MoveTarget>();

    expect(open.definition.render(targets[0], document.createElement("div"))).toBe("October 2026");
  });

  it("cancelling the suggest aborts", async () => {
    const { harness, picker } = await setup([]);

    const promise = picker.pickTarget([month("a", "x"), month("b", "y")]);
    harness.suggests.lastOpen().cancel();

    expect(errorOf(await promise)).toBeInstanceOf(UserAborted);
  });
});

describe("MoveTargetPicker.pickPeriodTarget", () => {
  const daily = fixedJournal("daily", { type: "day" });
  const weekly = fixedJournal("weekly", { type: "week" });

  it("the journal picker is skipped with one journal", async () => {
    const { harness, index, picker } = await setup([daily]);
    index.register({ journalName: "daily", anchor: anchor("2026-10-21"), path: "daily/2026-10-21.md" as VaultPath });

    const promise = picker.pickPeriodTarget();
    await tick();
    expect(harness.suggests.opens).toHaveLength(0);
    harness.modals.lastOpen().submit(DayPeriod.containing(date("2026-10-21")));

    expect(okValue(await promise)).toMatchObject({ journalName: "daily", path: "daily/2026-10-21.md" });
  });

  it("several journals ask which one first", async () => {
    const { harness, picker } = await setup([daily, weekly]);

    const promise = picker.pickPeriodTarget();
    const open = harness.suggests.lastOpen<string[], string>();
    expect(open.definition.placeholder?.([])).toBe(m.tasks_move_pick_journal());
    open.choose("daily");
    await tick();
    harness.modals.lastOpen().submit(DayPeriod.containing(date("2026-10-21")));

    expect(okValue(await promise)).toMatchObject({ journalName: "daily", path: null });
  });

  it("a period's note offers its notelets", async () => {
    const { harness, index, picker } = await setup([daily]);
    index.register({ journalName: "daily", anchor: anchor("2026-10-21"), path: "daily/2026-10-21.md" as VaultPath });
    index.register({
      kind: "notelet",
      journalName: "daily",
      anchor: anchor("2026-10-21"),
      path: "daily/notelets/Retro.md" as VaultPath,
      typeName: "Meeting",
      typeId: null,
    });

    const promise = picker.pickPeriodTarget();
    await tick();
    harness.modals.lastOpen().submit(DayPeriod.containing(date("2026-10-21")));
    await tick();
    const open = harness.suggests.lastOpen<readonly MoveTarget[], MoveTarget>();

    expect(open.input.map((target) => target.noteletTitle)).toEqual([undefined, "Retro"]);
    open.cancel();
    expect(errorOf(await promise)).toBeInstanceOf(UserAborted);
  });

  it("cancelling the journal or the date aborts", async () => {
    const { harness, picker } = await setup([daily, weekly]);

    const first = picker.pickPeriodTarget();
    harness.suggests.lastOpen().cancel();
    expect(errorOf(await first)).toBeInstanceOf(UserAborted);

    const second = picker.pickPeriodTarget();
    harness.suggests.lastOpen().choose("daily");
    await tick();
    harness.modals.lastOpen().cancel();
    expect(errorOf(await second)).toBeInstanceOf(UserAborted);
  });

  it("a custom interval is targeted at its start and labelled by its range", async () => {
    const { harness, picker } = await setup([customJournal("sprints", "day", 7, "2026-06-01")]);

    const promise = picker.pickPeriodTarget();
    await tick();
    harness.modals.lastOpen().submit(DayPeriod.containing(date("2026-06-10")));
    const target = okValue(await promise);

    expect(target.anchor).toBe(anchor("2026-06-08"));
    expect(target.label).toBe("Jun 8, 2026 – Jun 14, 2026");
  });

  it("a journal that vanishes after the pick is reported", async () => {
    const { harness, picker } = await setup([daily, weekly]);

    const promise = picker.pickPeriodTarget();
    harness.suggests.lastOpen<string[], string>().choose("ghost");

    const result = await promise;
    expectErr(result);
    expect(result.error).toBeInstanceOf(JournalNotFoundError);
  });

  it("no journals is reported without opening a picker", async () => {
    const { harness, picker } = await setup([]);

    const result = await picker.pickPeriodTarget();

    expectErr(result);
    expect(result.error).toBeInstanceOf(NoJournalsError);
    expect(harness.suggests.opens).toHaveLength(0);
  });
});
