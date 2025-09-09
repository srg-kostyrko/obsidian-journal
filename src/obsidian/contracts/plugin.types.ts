import type { EventRef } from "obsidian";

export interface PluginUnloader {
  register(callback: () => unknown): this;
  registerEvent(eventRef: EventRef): this;
}
