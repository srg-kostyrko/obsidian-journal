import { nanoid } from "nanoid";

import { CommandsRepository } from "@/commands/repository";
import { m } from "@/i18n";
import { inject } from "@/infrastructure/di";

import type { NoteletType, TypeId } from "./config";

/**
 * That a notelet type has a command, and what that command is, are journal decisions — the
 * commands module owns persisting and registering one, not deciding it should exist.
 */
export class NoteletCommandService {
  readonly #commands = inject(CommandsRepository);

  // Every type has a command from the moment it exists, so no later flow has to handle a
  // command-less one. Everything but the target is the user's from here.
  seed(journalName: string, type: NoteletType): void {
    this.#commands.create(nanoid(), {
      name: m.journal_notelet_command_name({ type: type.name }),
      icon: "",
      showInRibbon: false,
      openMode: "tab",
      target: { kind: "notelet", journalName, typeId: type.id },
      type: "same",
      context: "today",
    });
  }

  // Matched on both halves of the target: type ids are unique per journal, not across the vault,
  // so a bare id comparison would retire a same-id type's command in another journal.
  retire(journalName: string, typeId: TypeId): void {
    for (const [id, command] of this.#commands.find().entries()) {
      if (command.target.kind !== "notelet") continue;
      if (command.target.journalName !== journalName || command.target.typeId !== typeId) continue;
      this.#commands.delete(id);
    }
  }
}
