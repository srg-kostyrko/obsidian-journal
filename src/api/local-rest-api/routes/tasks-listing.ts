import { inject } from "@/infrastructure/di";

import { JournalsApiService } from "../../journals-api";
import { RestError } from "../errors";
import { INVALID_QUERY_VALUE, readQueryString, requireJournal } from "../request";

import type { TasksForOptions } from "../../public-api";
import type { RestRoute } from "../route";

const SOURCES = new Set(["note", "notelets", "both"]);
const DEPTHS = new Set(["literal", "rollup"]);

export class TasksListingRoute implements RestRoute {
  readonly #api = inject(JournalsApiService);

  readonly path = "/journals/:name/tasks/:date";
  readonly handlers = {
    get: async (request, response) => {
      const { name, date } = request.params;
      const source = readQueryString(request.query.source);
      const depth = readQueryString(request.query.depth);
      const status = readQueryString(request.query.status);
      if (source === INVALID_QUERY_VALUE || depth === INVALID_QUERY_VALUE || status === INVALID_QUERY_VALUE) {
        throw new RestError("invalid-request", "source, depth and status must each be a single string value.");
      }
      // Refused rather than defaulted: the API itself takes a typed value, and a misspelled scope
      // answering with the default would read as a correct, differently-scoped listing.
      if (source !== undefined && !SOURCES.has(source)) {
        throw new RestError("invalid-request", 'source must be "note", "notelets" or "both".');
      }
      if (depth !== undefined && !DEPTHS.has(depth)) {
        throw new RestError("invalid-request", 'depth must be "literal" or "rollup".');
      }
      await requireJournal(this.#api, name);

      const options: TasksForOptions = {
        ...(source !== undefined && { source: source as TasksForOptions["source"] }),
        ...(depth !== undefined && { depth: depth as TasksForOptions["depth"] }),
        ...(status !== undefined && { status }),
      };
      response.status(200).json({ tasks: await this.#api.tasksFor(name, date, options) });
    },
  } satisfies RestRoute["handlers"];
}
