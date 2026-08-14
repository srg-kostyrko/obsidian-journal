import type { VaultPath } from "./types";

/** The note's name as the user sees it — the last path segment without the `.md` extension. */
export function basenameOf(path: VaultPath): string {
  const filename = path.split("/").pop() ?? path;
  return filename.replace(/\.md$/, "");
}
