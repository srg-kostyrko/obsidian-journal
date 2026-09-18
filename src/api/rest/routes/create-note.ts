import { inject } from "@/infrastructure/di";

import { JournalsApiService } from "../../journals-api";
import { noteJson } from "../json";
import { readAnswers, requireJournal } from "../request";

import type { RestRoute } from "../route";

export class CreateNoteRoute implements RestRoute {
  readonly #api = inject(JournalsApiService);

  readonly path = "/journals/:name/notes/:date";
  readonly handlers = {
    post: async (request, response) => {
      const name = request.params.name;
      await requireJournal(this.#api, name);

      // Forwarded as-is, not validated here: the API rejects a non-plain-object, non-null answers
      // with invalid-answers. confirm: false too: a confirming journal with no questions would
      // otherwise still open a dialog nobody is watching for, and an HTTP call would hang on it.
      const answers = readAnswers(request.body as unknown);
      const result = await this.#api.ensureNote(name, request.params.date, { prompt: false, confirm: false, answers });
      response.status(result.created ? 201 : 200).json({ ...noteJson(result.note), created: result.created });
    },
  } satisfies RestRoute["handlers"];
}
