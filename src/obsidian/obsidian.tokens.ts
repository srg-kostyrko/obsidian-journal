import { createToken } from "@/infra/di/token";
import type { App, Plugin } from "obsidian";
import type { Vault as VaultContract, VaultEvents as VaultEventsContract } from "./contracts/vault.types";
import type { Emitter } from "nanoevents";

export const ObsidianApp = createToken<App>("ObsidianApp");

export const JournalPlugin = createToken<Plugin>("ObsidianPlugin");

export const Vault = createToken<VaultContract>("Vault");
export const VaultEvents = createToken<Emitter<VaultEventsContract>>("VaultEvents");
