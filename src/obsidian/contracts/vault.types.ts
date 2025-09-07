import type { AsyncResult, Result } from "@/infra/data-structures/result";
import type { Brand } from "@/types/utility.types";
import type { VaultError } from "../errors/VaultError";

export type FilePath = Brand<string, "FilePath">;
export function FilePath(path: string): FilePath {
  return path as FilePath;
}

export interface Vault {
  getMarkdownFiles(): FilePath[];
  getNotesInFolder(folderPath: string): Result<FilePath[], VaultError>;

  stats(path: FilePath): Result<
    {
      name: string;
      fileName: string;
      folder: string;
    },
    VaultError
  >;

  exists(path: FilePath): boolean;
  create(path: FilePath, content?: string): AsyncResult<void, VaultError>;
  modify(path: string, content: string): AsyncResult<void, VaultError>;
  append(path: string, content: string): AsyncResult<void, VaultError>;
  rename(path: string, newPath: string): AsyncResult<void, VaultError>;
  trash(path: string): AsyncResult<void, VaultError>;
  delete(path: string): AsyncResult<void, VaultError>;

  getContent(path: string): AsyncResult<string, VaultError>;
}

export interface VaultEvents {
  created: (path: FilePath) => void;
  renamed: (oldPath: FilePath, newPath: FilePath) => void;
  deleted: (path: FilePath) => void;
}
