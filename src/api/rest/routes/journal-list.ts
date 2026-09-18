import { inject } from "@/infrastructure/di";

import { JournalsApiService } from "../../journals-api";

import type { RestRoute } from "../route";

export class JournalListRoute implements RestRoute {
  readonly #api = inject(JournalsApiService);

  readonly path = "/journals/";
  readonly handlers = {
    get: async (_request, response) => {
      response.status(200).json({ journals: await this.#api.listJournals() });
    },
  } satisfies RestRoute["handlers"];
}
