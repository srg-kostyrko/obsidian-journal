import { describe, expect, it } from "vitest";

import { MigrationFailedError } from "./errors";
import { runMigrations } from "./migrations";

import type { Migration } from "./schema";

function bumpVersion(toVersion: number, calls?: string[]): Migration {
  return {
    fromVersion: toVersion - 1,
    toVersion,
    migrate: (raw) => (calls?.push(`mark${toVersion}`), { ...raw, [`mark${toVersion}`]: true }),
  };
}

describe("runMigrations", () => {
  describe("happy path", () => {
    it("chains migrations from version 0 up to the target", () => {
      const result = runMigrations({ version: 0 }, [bumpVersion(1), bumpVersion(2), bumpVersion(3)], 3);
      expect(result.kind).toBe("ok");
      if (result.kind !== "ok") return;
      expect(result.value).toEqual({ version: 3, mark1: true, mark2: true, mark3: true });
    });

    it("treats a missing version as 0", () => {
      const result = runMigrations({}, [bumpVersion(1)], 1);
      expect(result.kind).toBe("ok");
      if (result.kind !== "ok") return;
      expect(result.value.version).toBe(1);
    });

    it("returns the root unchanged when already at the target version", () => {
      const result = runMigrations({ version: 3, foo: "bar" }, [bumpVersion(1)], 3);
      expect(result.kind).toBe("ok");
      if (result.kind !== "ok") return;
      expect(result.value).toEqual({ version: 3, foo: "bar" });
    });
  });

  describe("ordering and discovery", () => {
    it("orders migrations by fromVersion regardless of binding order", () => {
      const calls: string[] = [];
      const result = runMigrations(
        { version: 0 },
        [bumpVersion(3, calls), bumpVersion(1, calls), bumpVersion(2, calls)],
        3,
      );
      expect(result.kind).toBe("ok");
      if (result.kind !== "ok") return;
      expect(result.value).toEqual({ version: 3, mark1: true, mark2: true, mark3: true });
      expect(calls).toEqual(["mark1", "mark2", "mark3"]);
    });

    it("runs every migration with the same fromVersion before advancing", () => {
      const calls: string[] = [];
      const a: Migration = { fromVersion: 0, toVersion: 1, migrate: (r) => (calls.push("a"), r) };
      const b: Migration = { fromVersion: 0, toVersion: 1, migrate: (r) => (calls.push("b"), r) };
      const c: Migration = { fromVersion: 1, toVersion: 2, migrate: (r) => (calls.push("c"), r) };
      const result = runMigrations({ version: 0 }, [a, b, c], 2);
      expect(result.kind).toBe("ok");
      expect(calls).toEqual(["a", "b", "c"]);
    });

    it("ignores identity migrations where fromVersion === toVersion", () => {
      const identity: Migration = { fromVersion: 0, toVersion: 0, migrate: (r) => r };
      const result = runMigrations({ version: 0 }, [identity, bumpVersion(1)], 1);
      expect(result.kind).toBe("ok");
    });
  });

  describe("failure modes", () => {
    it("fails when no migration matches the current version", () => {
      const result = runMigrations({ version: 1 }, [bumpVersion(3)], 3);
      expect(result.kind).toBe("err");
      if (result.kind !== "err") return;
      expect(result.error).toBeInstanceOf(MigrationFailedError);
      expect(result.error.stuckAt).toBe(1);
    });

    it("fails when migrations at the same step disagree on toVersion", () => {
      const a: Migration = { fromVersion: 1, toVersion: 2, migrate: (r) => r };
      const b: Migration = { fromVersion: 1, toVersion: 3, migrate: (r) => r };
      const result = runMigrations({ version: 1 }, [a, b], 3);
      expect(result.kind).toBe("err");
      if (result.kind !== "err") return;
      expect(result.error.stuckAt).toBe(1);
    });

    it("wraps a migration throw in MigrationFailedError", () => {
      const boom: Migration = {
        fromVersion: 0,
        toVersion: 1,
        migrate: () => {
          throw new Error("boom");
        },
      };
      const result = runMigrations({ version: 0 }, [boom], 1);
      expect(result.kind).toBe("err");
      if (result.kind !== "err") return;
      expect(result.error.cause).toBeInstanceOf(Error);
    });

    it("rejects roots whose version is ahead of the target", () => {
      const result = runMigrations({ version: 5 }, [], 3);
      expect(result.kind).toBe("err");
      if (result.kind !== "err") return;
      expect(result.error.stuckAt).toBe(5);
    });
  });
});
