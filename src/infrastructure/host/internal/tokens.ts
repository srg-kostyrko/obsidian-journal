import { createToken } from "@/infrastructure/di";

import type { App, Plugin } from "obsidian";

export const InternalPluginToken = createToken<Plugin>("host.internal.Plugin");
export const InternalObsidianAppToken = createToken<App>("host.internal.App");
