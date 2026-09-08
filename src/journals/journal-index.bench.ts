import { test } from "vitest";

import type { AnchorString } from "@/calendar";
import type { VaultPath } from "@/infrastructure/host";

import { JournalIndex } from "./journal-index";

const a = (s: string) => s as AnchorString;
const p = (s: string) => s as VaultPath;

function prepareTenYearsOfAnchors(): string[] {
  const dates: string[] = [];
  const cursor = new Date("2022-01-01T00:00:00Z");
  const end = new Date("2032-01-01T00:00:00Z");
  while (cursor < end) {
    dates.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return dates;
}

function filledIndex(): JournalIndex {
  const index = new JournalIndex();
  for (const date of prepareTenYearsOfAnchors()) {
    index.set(a(date), p("path/" + date));
  }
  return index;
}

test.todo("JournalIndex - filling in", async ({ bench }) => {
  const dates = prepareTenYearsOfAnchors();

  await bench.compare(
    bench("fill in journal - 1 year", () => {
      const index = new JournalIndex();
      for (const date of dates.slice(0, 365)) {
        index.set(a(date), p("path/" + date));
      }
    }),
    bench("fill in journal - 10 years", () => {
      const index = new JournalIndex();
      for (const date of dates) {
        index.set(a(date), p("path/" + date));
      }
    }),
  );
});

test("JournalIndex - find next", async ({ bench }) => {
  const index = filledIndex();

  await bench.compare(
    bench("find beginning", () => {
      index.findNext(a("2022-02-01"));
    }),
    bench("find middle", () => {
      index.findNext(a("2027-05-01"));
    }),
    bench("find end", () => {
      index.findNext(a("2030-12-01"));
    }),
    bench("find missing", () => {
      index.findNext(a("2031-01-01"));
    }),
  );
});

test("JournalIndex - find previous", async ({ bench }) => {
  const index = filledIndex();

  await bench.compare(
    bench("find beginning", () => {
      index.findPrevious(a("2022-02-01"));
    }),
    bench("find middle", () => {
      index.findPrevious(a("2027-05-01"));
    }),
    bench("find end", () => {
      index.findPrevious(a("2030-12-01"));
    }),
    bench("find missing", () => {
      index.findPrevious(a("2031-01-01"));
    }),
  );
});

test("JournalIndex - find closest anchor", async ({ bench }) => {
  const index = filledIndex();
  index.delete(a("2022-03-01"));
  index.delete(a("2027-06-01"));
  index.delete(a("2030-11-01"));

  await bench.compare(
    bench("find closest beginning known", () => {
      index.findClosestAnchor(a("2022-01-10"));
    }),
    bench("find closest middle known", () => {
      index.findClosestAnchor(a("2027-05-10"));
    }),
    bench("find closest end known", () => {
      index.findClosestAnchor(a("2030-12-10"));
    }),
    bench("find closest beginning gap", () => {
      index.findClosestAnchor(a("2022-03-01"));
    }),
    bench("find closest middle gap", () => {
      index.findClosestAnchor(a("2027-06-01"));
    }),
    bench("find closest end gap", () => {
      index.findClosestAnchor(a("2030-11-01"));
    }),
    bench("find closest before known", () => {
      index.findClosestAnchor(a("2021-12-01"));
    }),
    bench("find closest after known", () => {
      index.findClosestAnchor(a("2033-01-01"));
    }),
  );
});
