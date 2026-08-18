/**
 * Returns the Journals plugin API, or null when Journals is not installed or not enabled.
 *
 * Call this at the point of use rather than caching it at load: there is no readiness
 * event, and a plugin reload replaces the object.
 *
 * @param {import("obsidian").App} app
 * @returns {import("./index.js").JournalsApi | null}
 */
export function getJournalsApi(app) {
  return app?.plugins?.plugins?.journals?.api ?? null;
}
