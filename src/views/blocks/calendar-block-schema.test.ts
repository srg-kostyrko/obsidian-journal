import * as v from "valibot";
import { describe, expect, it } from "vitest";

import { calendarBlockBaseSchema } from "./calendar-block-schema";

const schema = v.object(calendarBlockBaseSchema);

describe("calendarBlockBaseSchema weeks", () => {
  it("defaults weeks to 'default' when omitted", () => {
    const parsed = v.parse(schema, { before: 0, after: 0 });
    expect(parsed.weeks).toBe("default");
  });

  it("accepts an explicit 'right' override", () => {
    const parsed = v.parse(schema, { before: 0, after: 0, weeks: "right" });
    expect(parsed.weeks).toBe("right");
  });
});
