import { createMultiToken } from "@/infrastructure/di";

import type { Request, Response } from "express";

export type RestVerb = "get" | "put" | "post" | "patch" | "delete";

/** Throws to answer with an error; the bridge maps whatever it throws through `sendError`. */
export type RestHandler = (request: Request, response: Response) => Promise<void>;

/** One path on the Local REST API host and the verbs it answers. */
export interface RestRoute {
  readonly path: string;
  readonly handlers: Partial<Record<RestVerb, RestHandler>>;
}

export const RestRouteToken = createMultiToken<RestRoute>("api.restRoute");
