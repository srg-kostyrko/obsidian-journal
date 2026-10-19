import { inject } from "@/infrastructure/di";

import { JournalsApiService } from "../../journals-api";
import { RestError } from "../errors";
import { noteJson } from "../json";
import { requireJournal } from "../request";

import type { RestRoute } from "../route";

export class AdjacentNoteRoute implements RestRoute {
  readonly #api = inject(JournalsApiService);

  readonly path = "/journals/:name/notes/:date/:direction";
  readonly handlers = {
    get: async (request, response) => {
      const { name, date, direction } = request.params;
      if (direction !== "previous" && direction !== "next") {
        throw new RestError("invalid-request", 'The last path segment must be "previous" or "next".', name);
      }
      await requireJournal(this.#api, name);

      const notes =
        direction === "previous" ? await this.#api.previousNote(name, date) : await this.#api.nextNote(name, date);
      const note = notes.at(0);
      // No neighbor is an answer, not a failure: the journal exists and simply has nothing on that side.
      response.status(200).json({ note: note === undefined ? null : noteJson(note) });
    },
  } satisfies RestRoute["handlers"];
}
