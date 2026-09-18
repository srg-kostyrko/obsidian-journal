import { inject } from "@/infrastructure/di";

import { JournalsApiService } from "../../journals-api";
import { journalNotFound } from "../request";

import type { RestRoute } from "../route";

export class JournalInfoRoute implements RestRoute {
  readonly #api = inject(JournalsApiService);

  readonly path = "/journals/:name/";
  readonly handlers = {
    get: async (request, response) => {
      const name = request.params.name;
      const info = await this.#api.journalInfo(name);
      if (info === null) throw journalNotFound(name);
      response.status(200).json(info);
    },
  } satisfies RestRoute["handlers"];
}
