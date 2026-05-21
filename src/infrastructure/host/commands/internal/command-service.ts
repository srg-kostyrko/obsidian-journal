import { inject } from "@/infrastructure/di";
import { LoggerFactoryToken } from "@/infrastructure/logger";

import { InternalPluginToken } from "../../internal/tokens";

import type { CommandRegistration } from "../types";

export class CommandService {
  readonly #plugin = inject(InternalPluginToken);
  readonly #logger = inject(LoggerFactoryToken).named("command-service");
  readonly #ribbons = new Map<string, HTMLElement>();

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
      const element = this.#plugin.addRibbonIcon(registration.icon, registration.name, () => {
        if (check && !check()) return;
        run();
      });
      this.#ribbons.set(registration.id, element);
    }
  }

  unregister(id: string): void {
    this.#plugin.removeCommand(id);
    const ribbon = this.#ribbons.get(id);
    if (ribbon) {
      ribbon.remove();
      this.#ribbons.delete(id);
    }
  }
}
