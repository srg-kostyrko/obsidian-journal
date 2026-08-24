import { describe, expect, it } from "vitest";

import { YearPeriod } from "@/calendar";
import { date } from "@/calendar/testing";

import { descend } from "./descend";
import { DatePickerInvariantError } from "./errors";

describe("descend", () => {
  it("throws DatePickerInvariantError on an impossible (view, picking, cellKind) combination", () => {
    // picking=quarter never lands on year view in the modal's flow
    const cell = YearPeriod.containing(date("2025-05-15"));
    expect(() => descend("year", "quarter", cell)).toThrow(DatePickerInvariantError);
  });
});
