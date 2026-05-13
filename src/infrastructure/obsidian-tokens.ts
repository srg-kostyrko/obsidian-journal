import { createToken } from "@/infrastructure/di";
import type JournalPlugin from "@/main";

import type { App } from "obsidian";

export const PluginToken = createToken<JournalPlugin>("Plugin");
export const ObsidianAppToken = createToken<App>("ObsidianApp");
