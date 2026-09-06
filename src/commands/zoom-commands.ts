import { m } from "@/i18n";
import { inject } from "@/infrastructure/di";
import { Flows } from "@/infrastructure/flows";
import { CommandService, NoticeService, WorkspaceService } from "@/infrastructure/host";
import type { Option } from "@/infrastructure/result";
import { JournalsIndex, JournalsRepository, OpenDateFlow } from "@/journals";
import type { IndexedNote } from "@/journals";
import { ShelvesRepository } from "@/shelves";

import { zoomTargets } from "./zoom-targets";

type Direction = "longer" | "shorter";

export class ZoomCommands {
  readonly #commands = inject(CommandService);
  readonly #workspace = inject(WorkspaceService);
  readonly #notices = inject(NoticeService);
  readonly #index = inject(JournalsIndex);
  readonly #journals = inject(JournalsRepository);
  readonly #shelves = inject(ShelvesRepository);
  readonly #flows = inject(Flows);

  // Unlike open-next/open-prev, which list even where no adjacent note exists, these hide when
  // scope holds no journal of the target granularity: that is a configuration fact rather than a
  // question about which notes are written, and it is what the palette filters on elsewhere.
  constructor() {
    this.#commands.register({
      id: "open-longer",
      name: m.command_open_longer(),
      check: () => this.#targets("longer").length > 0,
      execute: () => void this.#open("longer"),
    });
    this.#commands.register({
      id: "open-shorter",
      name: m.command_open_shorter(),
      check: () => this.#targets("shorter").length > 0,
      execute: () => void this.#open("shorter"),
    });
  }

  #activeEntry(): Option<IndexedNote> {
    return this.#workspace.activeNote().flatMap((path) => this.#index.entryByPath(path));
  }

  #targets(direction: Direction): readonly string[] {
    const entry = this.#activeEntry();
    if (!entry.isSome()) return [];
    const active = this.#journals.get(entry.value.journalName);
    if (!active.isSome()) return [];
    return zoomTargets(direction, active.value, [...this.#journals.find().list()], [...this.#shelves.find().list()]);
  }

  async #open(direction: Direction): Promise<void> {
    const entry = this.#activeEntry();
    if (!entry.isSome()) {
      this.#notices.show(m.command_open_needs_active_note());
      return;
    }
    const journalNames = this.#targets(direction);
    if (journalNames.length === 0) {
      this.#notices.show(direction === "longer" ? m.command_open_no_longer() : m.command_open_no_shorter());
      return;
    }
    await this.#flows.invoke(
      OpenDateFlow,
      { anchor: entry.value.anchor, journalNames },
      { context: { command: direction === "longer" ? "open-longer" : "open-shorter" } },
    );
  }
}
