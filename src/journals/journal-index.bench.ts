import { bench, describe } from "vitest";
import { JournalIndex } from "./journal-index";
import { JournalAnchorDate } from "@/types/journal.types";
import moment from "moment";

describe.skip("JournalIndex - filling in", () => {
  const dates = prepareTenYearsOfDates();

  bench("fill in journal - 1 year", () => {
    const index = new JournalIndex();
    for (const date of dates.slice(0, 365)) {
      index.set(JournalAnchorDate(date), "path/" + date);
    }
  });

  bench("fill in journal - 10 years", () => {
    const index = new JournalIndex();
    for (const date of dates) {
      index.set(JournalAnchorDate(date), "path/" + date);
    }
  });
});

describe("JournalIndex - find next", () => {
  const index = new JournalIndex();
  for (const date of prepareTenYearsOfDates()) {
    index.set(JournalAnchorDate(date), "path/" + date);
  }

  bench("find beginning", () => {
    index.findNext(JournalAnchorDate("2022-02-01"));
  });

  bench("find middle", () => {
    index.findNext(JournalAnchorDate("2027-05-01"));
  });

  bench("find end", () => {
    index.findNext(JournalAnchorDate("2030-12-01"));
  });

  bench("find missing", () => {
    index.findNext(JournalAnchorDate("2031-01-01"));
  });
});

describe("JournalIndex - find previous", () => {
  const index = new JournalIndex();
  for (const date of prepareTenYearsOfDates()) {
    index.set(JournalAnchorDate(date), "path/" + date);
  }

  bench("find beginning", () => {
    index.findPrevious(JournalAnchorDate("2022-02-01"));
  });

  bench("find middle", () => {
    index.findPrevious(JournalAnchorDate("2027-05-01"));
  });

  bench("find end", () => {
    index.findPrevious(JournalAnchorDate("2030-12-01"));
  });

  bench("find missing", () => {
    index.findPrevious(JournalAnchorDate("2031-01-01"));
  });
});

describe("JournalIndex - find closest date", () => {
  const index = new JournalIndex();
  for (const date of prepareTenYearsOfDates()) {
    index.set(JournalAnchorDate(date), "path/" + date);
  }
  index.delete(JournalAnchorDate("2022-03-01"));
  index.delete(JournalAnchorDate("2027-06-01"));
  index.delete(JournalAnchorDate("2030-11-01"));

  bench("find closest date beginning known", () => {
    index.findClosestDate("2022-01-10");
  });

  bench("find closest date middle known", () => {
    index.findClosestDate("2027-05-10");
  });

  bench("find closest date end known", () => {
    index.findClosestDate("2030-12-10");
  });

  bench("find closest date beginning", () => {
    index.findClosestDate("2022-03-01");
  });

  bench("find closest date middle", () => {
    index.findClosestDate("2027-06-01");
  });

  bench("find closest date end", () => {
    index.findClosestDate("2030-11-01");
  });

  bench("find closest date before known", () => {
    index.findClosestDate("2021-12-01");
  });

  bench("find closest date after known", () => {
    index.findClosestDate("2033-01-01");
  });
});

function prepareTenYearsOfDates() {
  const dates = [];
  const start = moment("2022-01-01");
  const end = start.clone().add(10, "years");

  while (start.isSameOrBefore(end)) {
    dates.push(start.format("YYYY-MM-DD"));
    start.add(1, "day");
  }
  return dates;
}
