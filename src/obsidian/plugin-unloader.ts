import { Injectable } from "@/infra/di/decorators/Injectable";
import type { PluginUnloader as PluginUnloaderContract } from "./contracts/plugin.types";
import { JournalPlugin, PluginUnloader as PluginUnloaderToken } from "./obsidian.tokens";
import type { EventRef } from "obsidian";
import { inject } from "@/infra/di/inject";

@Injectable(PluginUnloaderToken)
export class PluginUnloader implements PluginUnloaderContract {
  #plugin = inject(JournalPlugin);

  register(callback: () => unknown): this {
    this.#plugin.register(callback);
    return this;
  }
  registerEvent(eventRef: EventRef): this {
    this.#plugin.registerEvent(eventRef);
    return this;
  }
}
