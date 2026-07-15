import { TFile } from "obsidian";

import { inject } from "@/infrastructure/di";
import { LoggerFactoryToken } from "@/infrastructure/logger";
import { AsyncResult, InvariantError } from "@/infrastructure/result";

import { InternalObsidianAppToken } from "./tokens";

import type { TemplaterPlugin } from "./templater-plugin";
import type { VaultPath } from "../types";

const TEMPLATER_PLUGIN_ID = "templater-obsidian";
const RUN_MODE_CREATE_NEW_FROM_TEMPLATE = 0;

export class TemplaterService {
  readonly #app = inject(InternalObsidianAppToken);
  readonly #logger = inject(LoggerFactoryToken).named("templater");

  async #apply(templatePath: VaultPath, targetPath: VaultPath, content: string): Promise<string> {
    if (!content.includes("<%") && !content.includes("%>")) return content;
    const plugin = this.#applyCapablePlugin();
    if (!plugin) return content;
    const templateFile = this.#app.vault.getAbstractFileByPath(templatePath);
    const targetFile = this.#app.vault.getAbstractFileByPath(targetPath);
    if (!(templateFile instanceof TFile) || !(targetFile instanceof TFile)) return content;
    try {
      const config = plugin.templater.create_running_config(
        templateFile,
        targetFile,
        RUN_MODE_CREATE_NEW_FROM_TEMPLATE,
      );
      return await plugin.templater.parse_template(config, content);
    } catch (error) {
      this.#logger.debug("templater apply failed", { cause: String(error) });
      return content;
    }
  }

  async #cursorJump(path: VaultPath): Promise<void> {
    const plugin = this.#cursorCapablePlugin();
    if (!plugin) return;
    const file = this.#app.vault.getAbstractFileByPath(path);
    if (!(file instanceof TFile)) return;
    try {
      await plugin.editor_handler.jump_to_next_cursor_location(file, true);
    } catch (error) {
      this.#logger.debug("templater cursor jump failed", { cause: String(error) });
    }
  }

  #applyCapablePlugin(): TemplaterPlugin | null {
    const plugin = this.#rawPlugin();
    const templater = (plugin as { templater?: unknown } | null)?.templater;
    if (!templater || typeof templater !== "object") return null;
    const api = templater as Record<string, unknown>;
    if (typeof api.create_running_config !== "function") return null;
    if (typeof api.parse_template !== "function") return null;
    return plugin as TemplaterPlugin;
  }

  #cursorCapablePlugin(): Pick<TemplaterPlugin, "editor_handler"> | null {
    const plugin = this.#rawPlugin();
    const handler = (plugin as { editor_handler?: unknown } | null)?.editor_handler;
    if (!handler || typeof handler !== "object") return null;
    if (typeof (handler as Record<string, unknown>).jump_to_next_cursor_location !== "function") return null;
    return plugin as Pick<TemplaterPlugin, "editor_handler">;
  }

  #rawPlugin(): object | null {
    const plugins = (this.#app as { plugins?: { getPlugin?: (id: string) => unknown } }).plugins;
    const plugin = plugins?.getPlugin?.(TEMPLATER_PLUGIN_ID);
    return plugin && typeof plugin === "object" ? plugin : null;
  }

  templatesFolder(): string | null {
    const settings = (this.#rawPlugin() as { settings?: unknown } | null)?.settings;
    if (!settings || typeof settings !== "object") return null;
    const folder = (settings as Record<string, unknown>).templates_folder;
    return typeof folder === "string" ? folder : null;
  }

  apply(templatePath: VaultPath, targetPath: VaultPath, content: string): AsyncResult<string, never> {
    return AsyncResult.fromPromise(this.#apply(templatePath, targetPath, content), () => {
      throw new InvariantError("unreachable: #apply never rejects");
    });
  }

  cursorJump(path: VaultPath): AsyncResult<void, never> {
    return AsyncResult.fromPromise(this.#cursorJump(path), () => {
      throw new InvariantError("unreachable: #cursorJump never rejects");
    });
  }

  isSupported(): boolean {
    return this.#applyCapablePlugin() !== null;
  }
}
