import { inject } from "@/infrastructure/di";
import { PluginData, type PluginDataIOError } from "@/infrastructure/host";
import { AsyncResult, attempt } from "@/infrastructure/result";

import { SnapshotUnreadableError } from "../errors";

export type SnapshotReason = "migration" | "pre-restore";

export interface SnapshotInfo {
  readonly name: string;
  readonly fromVersion: number;
  readonly takenAt: string;
  readonly reason: SnapshotReason;
}

// Colons are legal in an ISO timestamp and illegal in a Windows filename, hence the dashes.
const NAME_PATTERN = /^backup-(restore-)?v(\d+)-(\d{4}-\d{2}-\d{2})T(\d{2})-(\d{2})-(\d{2})\.json$/;

function parseName(name: string): SnapshotInfo | undefined {
  const match = NAME_PATTERN.exec(name);
  if (!match) return undefined;
  const [, restore, version, date, hour, minute, second] = match;
  if (
    version === undefined ||
    date === undefined ||
    hour === undefined ||
    minute === undefined ||
    second === undefined
  ) {
    return undefined;
  }
  return {
    name,
    fromVersion: Number(version),
    takenAt: `${date}T${hour}:${minute}:${second}Z`,
    reason: restore === undefined ? "migration" : "pre-restore",
  };
}

function stampOf(takenAt: string): string {
  return takenAt.replaceAll(":", "-").slice(0, 19);
}

export class SnapshotService {
  readonly #data = inject(PluginData);

  write(fromVersion: number, contents: string, takenAt: string): AsyncResult<void, PluginDataIOError> {
    return this.#data.writeFile(`backup-v${fromVersion}-${stampOf(takenAt)}.json`, contents);
  }

  writePreRestore(fromVersion: number, contents: string, takenAt: string): AsyncResult<void, PluginDataIOError> {
    return this.#data.writeFile(`backup-restore-v${fromVersion}-${stampOf(takenAt)}.json`, contents);
  }

  prune(reason: SnapshotReason, keep: number): AsyncResult<void, PluginDataIOError> {
    return attempt.in(this, async function* () {
      const all = yield* this.list();
      const stale = all.filter((info) => info.reason === reason).slice(keep);
      for (const info of stale) {
        yield* this.#data.deleteFile(info.name);
      }
      return;
    });
  }

  list(): AsyncResult<SnapshotInfo[], PluginDataIOError> {
    return this.#data.listFiles().map((names) => {
      const parsed = names.flatMap((name) => {
        const info = parseName(name);
        return info === undefined ? [] : [info];
      });
      // Sort by takenAt, not name: name embeds a variable-width version number
      // ("v10" vs "v3"), which would shift alignment with the fixed-width date it precedes.
      parsed.sort((a, b) => b.takenAt.localeCompare(a.takenAt));
      return parsed;
    });
  }

  read(name: string): AsyncResult<Record<string, unknown>, PluginDataIOError | SnapshotUnreadableError> {
    return attempt.in(this, async function* () {
      const contents = yield* this.#data.readFile(name);
      let parsed: unknown;
      try {
        parsed = JSON.parse(contents);
      } catch (error) {
        return yield* AsyncResult.err(new SnapshotUnreadableError(name, error));
      }
      if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
        return yield* AsyncResult.err(new SnapshotUnreadableError(name, { message: "not a JSON object" }));
      }
      return parsed as Record<string, unknown>;
    });
  }
}
