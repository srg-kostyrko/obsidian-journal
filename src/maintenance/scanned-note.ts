import { CalendarDate } from "@/calendar";
import type { AnchorString } from "@/calendar";
import { inject } from "@/infrastructure/di";
import { NoteMetadataService, NotesService } from "@/infrastructure/host";
import type { VaultPath } from "@/infrastructure/host";
import { FRONTMATTER_NAME_KEY } from "@/journals/config";
import { CycleService } from "@/journals/cycle";
import { NotePathService } from "@/journals/notes/note-path";
import type { PathInverter } from "@/journals/notes/note-path";
import { JournalsRepository } from "@/journals/repository";

export interface ScannedNote {
  readonly path: VaultPath;
  readonly claimedJournal: string;
  readonly journalExists: boolean;
  readonly isDayJournal: boolean;
  readonly size: number;
  readonly mtime: number;
  readonly rawDate: unknown;
  readonly storedAnchor?: AnchorString;
  readonly canonicalAnchor?: AnchorString;
  // Present only for notes already known to be stranded — a healthy note's path is never inverted.
  readonly pathAnchor?: AnchorString;
  readonly storedStart?: string;
  readonly storedEnd?: string;
  readonly expectedStart?: AnchorString;
  // Presence is the discriminator, matching parseEntry's rule: the journal's type key was found
  // on the note at all, coerced to a string. Absence means a period note, never a malformed one.
  readonly noteletTypeName?: string;
  // Only meaningful alongside noteletTypeName — whether that name still matches a configured type.
  readonly noteletTypeExists?: boolean;
}

export type ResolveOutcome =
  | { kind: "resolved"; note: ScannedNote }
  | { kind: "not-a-claim" }
  | { kind: "unparsed" }
  | { kind: "custom" }
  | { kind: "unreadable"; message: string };

export class ScannedNoteResolver {
  readonly #journals = inject(JournalsRepository);
  readonly #cycle = inject(CycleService);
  readonly #path = inject(NotePathService);
  readonly #metadata = inject(NoteMetadataService);
  readonly #notes = inject(NotesService);
  readonly #inverters = new Map<string, PathInverter | undefined>();

  // One tokenize + one parse context per journal, not per note: on a vault where every note is
  // stranded (the case this feature exists for) the per-note cost would otherwise dominate.
  #inverterFor(name: string): PathInverter | undefined {
    if (this.#inverters.has(name)) return this.#inverters.get(name);
    const prepared = this.#path.inverterFor(name).getOrUndefined();
    this.#inverters.set(name, prepared);
    return prepared;
  }

  #resolve(path: VaultPath): ResolveOutcome {
    const metadata = this.#metadata.get(path);
    if (metadata.isNone()) return { kind: "unparsed" };
    const properties = metadata.value.properties;
    const claimed = properties[FRONTMATTER_NAME_KEY];
    if (typeof claimed !== "string") return { kind: "not-a-claim" };

    const found = this.#notes.find(path);
    const size = found.isSome() ? found.value.size : 0;
    const mtime = found.isSome() ? found.value.mtime : 0;

    const configOption = this.#journals.get(claimed);
    if (configOption.isNone()) {
      return {
        kind: "resolved",
        note: {
          path,
          claimedJournal: claimed,
          journalExists: false,
          isDayJournal: false,
          size,
          mtime,
          rawDate: undefined,
        },
      };
    }
    const config = configOption.value;
    if (config.write.type === "custom") return { kind: "custom" };

    const fields = config.frontmatter;
    const rawDate = properties[fields.dateField];
    const storedStart =
      typeof properties[fields.startDateField] === "string" ? (properties[fields.startDateField] as string) : undefined;
    const storedEnd =
      typeof properties[fields.endDateField] === "string" ? (properties[fields.endDateField] as string) : undefined;

    const rawType = properties[fields.noteletField];
    // Presence decides, exactly as parseEntry does: a malformed value is an unresolvable notelet,
    // never a period note promoted by accident.
    //
    // Re-reading properties[...] rather than calling String(rawType) works around
    // no-base-to-string: the rule cannot see that the null check above already excludes the
    // bare-object case it is guarding against.
    const noteletTypeName =
      rawType === undefined || rawType === null ? undefined : String(properties[fields.noteletField]);
    const noteletTypeExists =
      noteletTypeName === undefined
        ? undefined
        : Object.values(config.notelets).some((type) => type.name === noteletTypeName);

    let storedAnchor: AnchorString | undefined;
    if (typeof rawDate === "string") {
      const parsed = CalendarDate.parse(rawDate);
      if (parsed.isOk()) storedAnchor = parsed.value.toAnchor();
    }

    const canonicalAnchor =
      storedAnchor === undefined
        ? undefined
        : this.#cycle.anchorOf(claimed, CalendarDate.fromAnchor(storedAnchor)).getOrUndefined();

    const suspect = storedAnchor === undefined || canonicalAnchor !== storedAnchor;
    const pathAnchor = suspect ? this.#inverterFor(claimed)?.invert(path).getOrUndefined()?.anchor : undefined;

    const settled = canonicalAnchor ?? pathAnchor;
    const expectedStart =
      settled === undefined ? undefined : this.#cycle.startOf(claimed, settled).getOrUndefined()?.toAnchor();

    return {
      kind: "resolved",
      note: {
        path,
        claimedJournal: claimed,
        journalExists: true,
        isDayJournal: config.write.type === "day",
        size,
        mtime,
        rawDate,
        ...(storedAnchor !== undefined && { storedAnchor }),
        ...(canonicalAnchor !== undefined && { canonicalAnchor }),
        ...(pathAnchor !== undefined && { pathAnchor }),
        ...(storedStart !== undefined && { storedStart }),
        ...(storedEnd !== undefined && { storedEnd }),
        ...(expectedStart !== undefined && { expectedStart }),
        ...(noteletTypeName !== undefined && { noteletTypeName }),
        ...(noteletTypeExists !== undefined && { noteletTypeExists }),
      },
    };
  }

  resolve(path: VaultPath): ResolveOutcome {
    try {
      return this.#resolve(path);
    } catch (error) {
      return { kind: "unreadable", message: error instanceof Error ? error.message : String(error) };
    }
  }

  // A settings reload, a journal edit or a snapshot restore can change what a journal's template
  // inverts to, and the resolver is a container-lifetime singleton — so a scan must start from a
  // clean cache or it keeps inverting against a journal config that no longer exists.
  resetInverters(): void {
    this.#inverters.clear();
  }
}
