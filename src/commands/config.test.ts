import * as v from "valibot";
import { describe, expect, it } from "vitest";

import { commandCollection } from "./config";

describe("commandCollection", () => {
  it("produces a schema-valid config from defaultItem", () => {
    const item = commandCollection.defaultItem("cmd-1");
    const parsed = v.safeParse(commandCollection.itemSchema, item);
    expect(parsed.success).toBe(true);
  });

  it("rejects an all-target command whose write type is custom", () => {
    const command = {
      name: "Cmd",
      icon: "",
      showInRibbon: false,
      openMode: "active",
      target: { kind: "all", writeType: "custom" },
      type: "same",
      context: "today",
    };
    const parsed = v.safeParse(commandCollection.itemSchema, command);
    expect(parsed.success).toBe(false);
  });
});
