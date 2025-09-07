import type { Container } from "@/infra/di/contracts/container.types";
import type { Module } from "@/infra/di/contracts/module.types";
import type { App, Plugin } from "obsidian";
import { JournalPlugin, ObsidianApp, VaultEvents } from "./obsidian.tokens";
import { VaultAdapter } from "./vault.adapter";
import { createNanoEvents } from "nanoevents";
import { WorkspaceAdapter } from "./workspace.adapter";

export class ObsidianModule implements Module {
  #app: App;
  #plugin: Plugin;

  constructor(app: App, plugin: Plugin) {
    this.#app = app;
    this.#plugin = plugin;
  }

  provides = [VaultAdapter, WorkspaceAdapter];

  load(container: Container) {
    container.register(ObsidianApp).useValue(this.#app);
    container.register(JournalPlugin).useValue(this.#plugin);
    container.register(VaultEvents).useFactory(() => createNanoEvents());
  }
}
