// Rolled detection reads the tags metadataCache parsed, so a marker Obsidian does not parse as a tag
// would be stamped and never read back, and the line would roll again on every run.
const TAG_BODY = /^[\p{L}\p{N}_\-/]+$/u;
const ALL_DIGITS = /^\p{N}+$/u;

export type MarkerProblem = "required" | "invalid";

/** Why a stored or normalized rolled marker is not a tag Obsidian reads back, or null when it is. */
export function markerProblem(marker: string): MarkerProblem | null {
  if (marker === "" || marker === "#") return "required";
  const body = marker.slice(1);
  if (!marker.startsWith("#") || !TAG_BODY.test(body) || ALL_DIGITS.test(body)) return "invalid";
  return null;
}
