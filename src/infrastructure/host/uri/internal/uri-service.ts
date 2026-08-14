import { inject } from "@/infrastructure/di";

import { InternalPluginToken } from "../../internal/tokens";

import type { UriHandler } from "../types";

export class UriService {
  readonly #plugin = inject(InternalPluginToken);

  register(action: string, handler: UriHandler): void {
    this.#plugin.registerObsidianProtocolHandler(action, handler);
  }
}
