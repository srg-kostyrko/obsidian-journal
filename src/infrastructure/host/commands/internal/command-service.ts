import { inject } from "@/infrastructure/di";
import { LoggerFactoryToken } from "@/infrastructure/logger";

import { InternalPluginToken } from "../../internal/tokens";

import type { CommandRegistration } from "../types";

interface RibbonHandle {
  readonly actionId: string;
  readonly element: HTMLElement;
}

export class CommandService {
  readonly #plugin = inject(InternalPluginToken);
  readonly #logger = inject(LoggerFactoryToken).named("command-service");
  readonly #ribbons = new Map<string, RibbonHandle>();

  constructor() {
    // Obsidian auto-removes a plugin's commands on unload, but ribbon icons added
    // through the ribbon registry directly are ours to tear down.
    this.#plugin.register(() => this.#teardownRibbons());
  }

  register(registration: CommandRegistration): void {
    const run = (): void => {
      try {
        const result = registration.execute();
        if (result instanceof Promise) {
          result.catch((error: unknown) => {
            this.#logger.error("command execute failed", { id: registration.id, error });
          });
        }
      } catch (error) {
        this.#logger.error("command execute failed", { id: registration.id, error });
      }
    };

    const { check } = registration;
    if (check) {
      this.#plugin.addCommand({
        id: registration.id,
        name: registration.name,
        icon: registration.icon,
        checkCallback: (checking: boolean): boolean => {
          if (checking) return check();
          if (!check()) return false;
          run();
          return true;
        },
      });
    } else {
      this.#plugin.addCommand({
        id: registration.id,
        name: registration.name,
        icon: registration.icon,
        callback: run,
      });
    }

    if (registration.ribbon && registration.icon) {
      const actionId = ribbonActionId(registration.id);
      const element = this.#plugin.app.workspace.leftRibbon.addRibbonItemButton(
        actionId,
        registration.icon,
        registration.name,
        () => {
          if (check && !check()) return;
          run();
        },
      );
      this.#ribbons.set(registration.id, { actionId, element });
    }
  }

  unregister(id: string): void {
    this.#plugin.removeCommand(id);
    const ribbon = this.#ribbons.get(id);
    if (ribbon) {
      this.#removeRibbon(ribbon);
      this.#ribbons.delete(id);
    }
  }

  #teardownRibbons(): void {
    for (const ribbon of this.#ribbons.values()) this.#removeRibbon(ribbon);
    this.#ribbons.clear();
  }

  #removeRibbon(ribbon: RibbonHandle): void {
    this.#plugin.app.workspace.leftRibbon.removeRibbonAction(ribbon.actionId);
    ribbon.element.remove();
  }
}

function ribbonActionId(commandId: string): string {
  return `journal-command:${commandId}`;
}
