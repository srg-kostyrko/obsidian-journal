import { inject } from "@/infrastructure/di";

import { JournalsApiService } from "../../journals-api";
import { RestError } from "../errors";
import { noteJson, noteletJson } from "../json";
import { INVALID_QUERY_VALUE, readQueryString, requireJournal } from "../request";

import type { RestRoute } from "../route";

export class NotesListingRoute implements RestRoute {
  readonly #api = inject(JournalsApiService);

  readonly path = "/journals/:name/notes";
  readonly handlers = {
    get: async (request, response) => {
      const name = request.params.name;
      await requireJournal(this.#api, name);

      const from = readQueryString(request.query.from);
      const to = readQueryString(request.query.to);
      const type = readQueryString(request.query.type);
      if (from === INVALID_QUERY_VALUE || to === INVALID_QUERY_VALUE || type === INVALID_QUERY_VALUE) {
        throw new RestError("invalid-request", "from, to and type must each be a single string value.");
      }
      if ((from === undefined) !== (to === undefined)) {
        throw new RestError("invalid-request", "from and to must be supplied together.");
      }

      if (from === undefined || to === undefined) {
        // Notelets have no unbounded read, so an open-ended listing only ever covers notes.
        const notes = await this.#api.existingNotes(name);
        response.status(200).json({ notes: notes.map(noteJson), notelets: [] });
        return;
      }

      const range = { from, to };
      const [notes, notelets] = await Promise.all([
        this.#api.existingNotes(name, range),
        this.#api.noteletsInRange(name, range, type === undefined ? undefined : { type }),
      ]);
      response.status(200).json({ notes: notes.map(noteJson), notelets: notelets.map(noteletJson) });
    },
  } satisfies RestRoute["handlers"];
}
