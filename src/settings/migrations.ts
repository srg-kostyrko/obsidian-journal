import { Err, Ok, type Result } from "@/infrastructure/result";

import { MigrationFailedError } from "./errors";

import type { Migration } from "./schema";

export function runMigrations(
  raw: Record<string, unknown>,
  migrations: readonly Migration[],
  targetVersion: number,
): Result<Record<string, unknown>, MigrationFailedError> {
  const byFrom = new Map<number, Migration[]>();
  for (const m of migrations) {
    if (m.fromVersion === m.toVersion) continue;
    const list = byFrom.get(m.fromVersion) ?? [];
    list.push(m);
    byFrom.set(m.fromVersion, list);
  }

  let current: Record<string, unknown> = raw;
  let version = typeof current.version === "number" ? current.version : 0;

  if (version > targetVersion) return new Err(new MigrationFailedError(version));

  while (version < targetVersion) {
    const steps = byFrom.get(version);
    if (!steps || steps.length === 0) return new Err(new MigrationFailedError(version));
    const nextVersion = steps[0].toVersion;
    for (const step of steps) {
      if (step.toVersion !== nextVersion) return new Err(new MigrationFailedError(version));
      try {
        current = step.migrate(current);
      } catch (error) {
        return new Err(new MigrationFailedError(version, error));
      }
    }
    version = nextVersion;
  }

  return new Ok({ ...current, version: targetVersion });
}
