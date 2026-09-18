import { getAPI, type LocalRestApiPublicApi } from "obsidian-local-rest-api";

import { inject } from "@/infrastructure/di";
import { InternalObsidianAppToken, InternalPluginToken } from "@/infrastructure/host/internal/tokens";
import { LoggerFactoryToken } from "@/infrastructure/logger";

import { JournalsApiService } from "../journals-api";

import { registerJournalRoutes } from "./routes";

const HOST_LOADED_EVENT = "obsidian-local-rest-api:loaded";

export class LocalRestApiBridge {
  readonly #app = inject(InternalObsidianAppToken);
  readonly #plugin = inject(InternalPluginToken);
  readonly #api = inject(JournalsApiService);
  readonly #logger = inject(LoggerFactoryToken).named("local-rest-api");
  #handle: LocalRestApiPublicApi | undefined;

  #register(): void {
    this.#release();
    try {
      const handle = getAPI(this.#app, this.#plugin.manifest);
      if (!handle) return;
      registerJournalRoutes((path) => handle.addRoute(path), this.#api);
      this.#handle = handle;
    } catch (error) {
      this.#logger.debug("local rest api registration failed", { cause: String(error) });
    }
  }

  #release(): void {
    try {
      this.#handle?.unregister();
    } catch {
      // A reloaded host has already dropped this handle's routes.
    }
    this.#handle = undefined;
  }

  initialize(): void {
    this.#register();
    // The host fires this on every load, so it covers both an install after us and a host reload,
    // which discards every route registered on its previous instance. Workspace's `on` overloads
    // are all specific string literals with no plain-`string` fallback reachable from a `const`
    // whose type widened, so a bare `HOST_LOADED_EVENT` fails every overload (TS2769). Casting to
    // "quit" — rather than widening the signature some other way — picks an existing overload whose
    // callback we can satisfy with zero parameters; we never read its `tasks` argument.
    this.#plugin.registerEvent(this.#app.workspace.on(HOST_LOADED_EVENT as "quit", () => this.#register()));
  }

  [Symbol.dispose](): void {
    this.#release();
  }
}
