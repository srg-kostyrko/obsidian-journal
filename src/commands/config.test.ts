import * as v from "valibot";
import { describe, expect, it } from "vitest";

import { commandCollection, sameCommandOwner } from "./config";

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

  describe("seed", () => {
    it("seeds the fifteen default commands on a fresh install", () => {
      const seeded = commandCollection.seed?.() ?? {};
      expect(Object.keys(seeded)).toHaveLength(15);
    });

    it("produces schema-valid configs for every seeded command", () => {
      const seeded = commandCollection.seed?.() ?? {};
      for (const command of Object.values(seeded)) {
        expect(v.safeParse(commandCollection.itemSchema, command).success).toBe(true);
      }
    });
  });

  describe("notelet target", () => {
    it("parses a notelet target", () => {
      const parsed = v.parse(commandCollection.itemSchema, {
        ...commandCollection.defaultItem(""),
        name: "New standup",
        target: { kind: "notelet", journalName: "Work", typeId: "nt_7f3a" },
      });

      expect(parsed.target).toEqual({ kind: "notelet", journalName: "Work", typeId: "nt_7f3a" });
    });

    it("refuses a notelet target with a blank type id", () => {
      expect(() =>
        v.parse(commandCollection.itemSchema, {
          ...commandCollection.defaultItem(""),
          name: "New standup",
          target: { kind: "notelet", journalName: "Work", typeId: "" },
        }),
      ).toThrow();
    });

    it("treats two notelet commands of one journal as the same owner", () => {
      const standup = { kind: "notelet", journalName: "Work", typeId: "nt_7f3a" } as const;
      const oneOnOne = { kind: "notelet", journalName: "Work", typeId: "nt_91bc" } as const;

      expect(sameCommandOwner(standup, oneOnOne)).toBe(true);
    });

    it("treats notelet commands of different journals as different owners", () => {
      const work = { kind: "notelet", journalName: "Work", typeId: "nt_7f3a" } as const;
      const home = { kind: "notelet", journalName: "Home", typeId: "nt_7f3a" } as const;

      expect(sameCommandOwner(work, home)).toBe(false);
    });

    it("treats a notelet command and its journal's own command as different owners", () => {
      const notelet = { kind: "notelet", journalName: "Work", typeId: "nt_7f3a" } as const;
      const journal = { kind: "journal", journalName: "Work" } as const;

      expect(sameCommandOwner(notelet, journal)).toBe(false);
    });
  });
});
