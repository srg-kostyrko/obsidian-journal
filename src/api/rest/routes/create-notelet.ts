import { inject } from "@/infrastructure/di";

import { JournalsApiService } from "../../journals-api";
import { RestError } from "../errors";
import { noteletJson } from "../json";
import { isPlainObject, readAnswers, requireJournal } from "../request";

import type { RestRoute } from "../route";

function readNoteletType(body: unknown): string | undefined {
  if (!isPlainObject(body)) return undefined;
  return typeof body.type === "string" ? body.type : undefined;
}

function noteletTypeError(body: unknown): RestError {
  if (!isPlainObject(body)) {
    return new RestError(
      "invalid-request",
      "No JSON body was received. Send the request with Content-Type: application/json and a type field.",
    );
  }
  return new RestError("invalid-request", "type must be a string.");
}

export class CreateNoteletRoute implements RestRoute {
  readonly #api = inject(JournalsApiService);

  readonly path = "/journals/:name/notelets/:date";
  readonly handlers = {
    post: async (request, response) => {
      const name = request.params.name;
      await requireJournal(this.#api, name);

      const body: unknown = request.body as unknown;
      const type = readNoteletType(body);
      if (type === undefined) throw noteletTypeError(body);

      // confirm: false alongside notes' own call, for consistency: prompt: false already suppresses
      // the creation prompts here, but nothing should be left open to a confirming type's dialog.
      const notelet = await this.#api.createNotelet(name, request.params.date, type, {
        prompt: false,
        confirm: false,
        answers: readAnswers(body),
      });
      response.status(201).json(noteletJson(notelet));
    },
  } satisfies RestRoute["handlers"];
}
