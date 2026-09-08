import { CalendarDate } from "@/calendar";
import { m } from "@/i18n";
import { inject } from "@/infrastructure/di";
import { Flows } from "@/infrastructure/flows";
import { CommandService, NoticeService, WorkspaceService } from "@/infrastructure/host";
import type { Option } from "@/infrastructure/result";
import { CycleService, JournalsIndex, JournalsRepository, OpenDateFlow, TimelineService } from "@/journals";
import type { IndexedNote, JournalConfig } from "@/journals";
import { ShelvesRepository } from "@/shelves";

import { zoomTargets } from "./zoom-targets";

type Direction = "longer" | "shorter";

export class ZoomCommands {
  readonly #commands = inject(CommandService);
  readonly #workspace = inject(WorkspaceService);
  readonly #notices = inject(NoticeService);
  readonly #index = inject(JournalsIndex);
  readonly #journals = inject(JournalsRepository);
  readonly #cycle = inject(CycleService);
  readonly #timeline = inject(TimelineService);
  readonly #shelves = inject(ShelvesRepository);
  readonly #flows = inject(Flows);

  // Unlike open-next/open-prev, which list even where no adjacent note exists, these hide when
  // scope holds no journal of the target granularity: that is a configuration fact rather than a
  // question about which notes are written, and it is what the palette filters on elsewhere.
  constructor() {
    this.#commands.register({
      id: "zoom-out",
      name: m.command_zoom_out(),
      check: () => this.#targets("longer").length > 0,
      execute: () => void this.#open("longer"),
    });
    this.#commands.register({
      id: "zoom-in",
      name: m.command_zoom_in(),
      check: () => this.#targets("shorter").length > 0,
      execute: () => void this.#open("shorter"),
    });
  }

  #activeEntry(): Option<IndexedNote> {
    return this.#workspace.activeNote().flatMap((path) => this.#index.entryByPath(path));
  }

  // A journal whose timeline does not reach the date is not a granularity that is available
  // here, so it is dropped before the walk and the next one along answers instead. Leaving it in
  // would hand OpenDateFlow a journal it discards, and its NoApplicableJournals is logged and
  // shown to nobody — the command would list, run, and do nothing.
  #covers(journal: JournalConfig, date: CalendarDate): boolean {
    const anchor = this.#cycle.anchorOf(journal.name, date);
    return anchor.isSome() && this.#timeline.contains(journal.name, anchor.value);
  }

  #targets(direction: Direction): readonly string[] {
    const entry = this.#activeEntry();
    if (!entry.isSome()) return [];
    const active = this.#journals.get(entry.value.journalName);
    if (!active.isSome()) return [];
    const date = CalendarDate.fromAnchor(entry.value.anchor);
    const available = [...this.#journals.find().list()].filter((journal) => this.#covers(journal, date));
    return zoomTargets(direction, active.value, available, [...this.#shelves.find().list()]);
  }

  async #open(direction: Direction): Promise<void> {
    const entry = this.#activeEntry();
    if (!entry.isSome()) {
      this.#notices.show(m.command_open_needs_active_note());
      return;
    }
    const journalNames = this.#targets(direction);
    if (journalNames.length === 0) {
      this.#notices.show(direction === "longer" ? m.command_zoom_no_longer() : m.command_zoom_no_shorter());
      return;
    }
    await this.#flows.invoke(
      OpenDateFlow,
      { anchor: entry.value.anchor, journalNames },
      { context: { command: direction === "longer" ? "zoom-out" : "zoom-in" } },
    );
  }
}
