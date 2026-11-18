import { test } from "vitest";

import type { AnchorString } from "@/calendar";
import { Lifetime } from "@/infrastructure/di";
import type { VaultPath } from "@/infrastructure/host";
import { testContainer } from "@/testing";

import { JournalsIndex } from "../journals-index";
import { journalsCoreModule } from "../module";
import { fixedJournal } from "../testing";

import { LinkReferenceIndex } from "./link-reference-index";

// A 20k-note vault, five links a note: 40% resolve to an existing daily note, 40% are unresolved
// date text across three journals (most of it repeated, as planning notes repeat dates), 20% are
// unresolved text that names no period.
const NOTES = 20_000;
const LINKS_PER_NOTE = 5;
const DAILY_NOTES = 1000;

function dayOf(seed: number): string {
  return new Date(Date.UTC(2024, 0, 1) + (seed % 1095) * 86_400_000).toISOString().slice(0, 10);
}

function weekOf(seed: number): string {
  return `${2024 + (seed % 3)}-W${String((seed % 52) + 1).padStart(2, "0")}`;
}

test("LinkReferenceIndex - full build", async ({ bench }) => {
  const harness = await testContainer({
    modules: [journalsCoreModule],
    data: {
      journals: {
        Daily: fixedJournal("Daily", { type: "day" }, { folder: "Daily", nameTemplate: "{{date:YYYY-MM-DD}}" }),
        Weekly: fixedJournal("Weekly", { type: "week" }, { folder: "Weekly", nameTemplate: "{{date:GGGG-[W]WW}}" }),
        Monthly: fixedJournal("Monthly", { type: "month" }, { folder: "Monthly", nameTemplate: "{{date:YYYY-MM}}" }),
      },
    },
    // A fresh index per iteration, so each one pays the whole build rather than reading a built one.
    overrides: [(c) => c.override(LinkReferenceIndex).useClass(LinkReferenceIndex).lifetime(Lifetime.Transient)],
  });
  const journals = harness.resolve(JournalsIndex);
  for (let n = 0; n < DAILY_NOTES; n++) {
    const path = `Daily/${dayOf(n)}.md`;
    harness.host.putFile(path);
    journals.register({ journalName: "Daily", anchor: dayOf(n) as AnchorString, path: path as VaultPath });
  }
  journals.markReady();
  for (let n = 0; n < NOTES; n++) {
    const path = `Notes/${n}.md`;
    harness.host.putFile(path);
    const resolved: Record<string, number> = {};
    const unresolved: Record<string, number> = {};
    for (let link = 0; link < LINKS_PER_NOTE; link++) {
      const seed = n * LINKS_PER_NOTE + link;
      const bucket = seed % 5;
      if (bucket < 2) resolved[`Daily/${dayOf(seed % DAILY_NOTES)}.md`] = 1;
      else if (bucket === 2) unresolved[dayOf(DAILY_NOTES + (seed % 400))] = 1;
      else if (bucket === 3) unresolved[seed % 2 === 0 ? weekOf(seed) : dayOf(seed).slice(0, 7)] = 1;
      else unresolved[`Topic ${seed % 3000}`] = 1;
    }
    harness.host.setLinks(path, { resolved, unresolved });
  }

  const live = harness.resolve(LinkReferenceIndex);
  await live.initialize();
  let edit = 0;

  await bench.compare(
    bench("full build: 20k notes × 5 links, 3 journals", async () => {
      const links = harness.resolve(LinkReferenceIndex);
      await links.initialize();
      links[Symbol.dispose]();
    }),
    // What every save of a note pays once the index is built.
    bench("one note's links change", () => {
      edit++;
      harness.host.setLinks("Notes/0.md", { unresolved: { [dayOf(edit)]: 1, [weekOf(edit)]: 1 } });
    }),
  );
});
