import type { VaultPath } from "@/infrastructure/host";

// Split a vault path into its folder and filename. Folder is "" for a root-level note.
export function splitVaultPath(path: VaultPath | string): [folder: string, name: string] {
  const i = path.lastIndexOf("/");
  return i === -1 ? ["", path] : [path.slice(0, i), path.slice(i + 1)];
}
