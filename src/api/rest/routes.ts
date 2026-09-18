import type { JournalsApi } from "../public-api";
import type { IRoute, Request, Response } from "express";

async function listJournals(response: Response, api: JournalsApi): Promise<void> {
  try {
    response.status(200).json({ journals: await api.listJournals() });
  } catch (error) {
    response.status(500).json({
      code: "internal-error",
      message: error instanceof Error ? error.message : String(error),
    });
  }
}

/** Registers Journals' surface on the Local REST API host, scoped to `addRoute`'s own handle. */
export function registerJournalRoutes(addRoute: (path: string) => IRoute, api: JournalsApi): void {
  // Express 4 does not catch a rejected handler promise, so the handler itself must stay
  // void-returning; listJournals is where the actual awaiting (and its own try/catch) live.
  addRoute("/journals/").get((_request: Request, response: Response) => void listJournals(response, api));
}
