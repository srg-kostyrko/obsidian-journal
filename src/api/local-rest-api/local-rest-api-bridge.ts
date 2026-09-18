import { getAPI, type LocalRestApiPublicApi } from "obsidian-local-rest-api";

import { inject } from "@/infrastructure/di";
import { InternalObsidianAppToken, InternalPluginToken } from "@/infrastructure/host/internal/tokens";
import { LoggerFactoryToken } from "@/infrastructure/logger";

import { sendError } from "./errors";
import { RestRouteToken, type RestVerb } from "./route";

import type { Events } from "obsidian";

const HOST_LOADED_EVENT = "obsidian-local-rest-api:loaded";

const VERBS: readonly RestVerb[] = ["get", "put", "post", "patch", "delete"];

export class LocalRestApiBridge {
  readonly #app = inject(InternalObsidianAppToken);
  readonly #plugin = inject(InternalPluginToken);
  readonly #routes = inject(RestRouteToken);
  readonly #logger = inject(LoggerFactoryToken).named("local-rest-api");
  #handle: LocalRestApiPublicApi | undefined;

  #register(): void {
    this.#release();
    try {
      const handle = getAPI(this.#app, this.#plugin.manifest);
      if (!handle) return;
      // Held before registering: a throw partway through the routes below must still leave
      // #release() something to unregister, or whatever routes it did add before throwing are
      // stuck on the host forever.
      this.#handle = handle;
      for (const route of this.#routes) {
        const hostRoute = handle.addRoute(route.path);
        for (const verb of VERBS) {
          const handler = route.handlers[verb];
          // Express 4 does not catch a rejected handler promise, so the host sees a void-returning
          // handler and the rejection is answered here.
          if (handler !== undefined) {
            hostRoute[verb](
              (request, response) =>
                void handler(request, response).catch((error: unknown) => sendError(response, error)),
            );
          }
        }
      }
    } catch (error) {
      this.#logger.debug("local rest api registration failed", { cause: String(error) });
      this.#release();
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
    // which discards every route registered on its previous instance. Widened to Events: Workspace's
    // own `on` overloads are all specific string literals, which shadow the plain-`string` overload
    // this custom event name needs.
    const events: Events = this.#app.workspace;
    this.#plugin.registerEvent(events.on(HOST_LOADED_EVENT, () => this.#register()));
  }

  [Symbol.dispose](): void {
    this.#release();
  }
}
