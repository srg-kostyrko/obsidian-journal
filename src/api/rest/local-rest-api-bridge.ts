import { getAPI, type LocalRestApiPublicApi } from "obsidian-local-rest-api";

import type { AnchorString } from "@/calendar";
import { inject } from "@/infrastructure/di";
import { NoteNotFoundError } from "@/infrastructure/host";
import { InternalObsidianAppToken, InternalPluginToken } from "@/infrastructure/host/internal/tokens";
import { LoggerFactoryToken } from "@/infrastructure/logger";
import { JournalNotFoundError } from "@/journals/errors";
import { BodyFrontmatterError } from "@/journals/notes/errors";
import { NoteCreationService } from "@/journals/notes/note-creation";

import { JournalsApiService } from "../journals-api";

import { RestError } from "./errors";
import { registerJournalRoutes, type NoteContent } from "./routes";

import type { Events } from "obsidian";

const HOST_LOADED_EVENT = "obsidian-local-rest-api:loaded";

export class LocalRestApiBridge {
  readonly #app = inject(InternalObsidianAppToken);
  readonly #plugin = inject(InternalPluginToken);
  readonly #api = inject(JournalsApiService);
  readonly #creation = inject(NoteCreationService);
  readonly #logger = inject(LoggerFactoryToken).named("local-rest-api");
  #handle: LocalRestApiPublicApi | undefined;

  // The route hands over the date ensureNote answered with, which is the note's anchor.
  readonly #content: NoteContent = {
    replace: async (journal, date, body) => {
      const result = await this.#creation.replaceContent(journal, date as AnchorString, body);
      if (result.isOk()) return;
      const error = result.error;
      if (error instanceof JournalNotFoundError) {
        throw new RestError("journal-not-found", `Journal not found: ${journal}`, journal);
      }
      if (error instanceof BodyFrontmatterError) {
        throw new RestError(
          "invalid-request",
          `The frontmatter in the request body could not be read: ${error.reason}`,
          journal,
        );
      }
      if (error instanceof NoteNotFoundError) {
        throw new RestError("note-not-found", `Note not found: ${journal} ${date}`, journal);
      }
      throw new RestError("write-failed", error.message, journal);
    },
  };

  #register(): void {
    this.#release();
    try {
      const handle = getAPI(this.#app, this.#plugin.manifest);
      if (!handle) return;
      // Held before registering: a throw partway through registerJournalRoutes must still leave
      // #release() something to unregister, or whatever routes it did add before throwing are
      // stuck on the host forever.
      this.#handle = handle;
      registerJournalRoutes((path) => handle.addRoute(path), this.#api, this.#content);
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
