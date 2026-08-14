import { describe, expect, it } from "vitest";

import {
  FolderNotFoundError,
  FrontmatterError,
  NoteAlreadyExistsError,
  NoteCreateError,
  NoteDeleteError,
  NoteNotFoundError,
  NoteReadError,
  NoteRenameError,
  NoteWriteError,
  PluginDataIOError,
  WorkspaceOpenError,
} from "./errors";

import type { VaultPath } from "./types";

const path = "Daily/2026-05-13.md" as VaultPath;

describe("NoteNotFoundError", () => {
  it("carries the requested path", () => {
    expect(new NoteNotFoundError(path).path).toBe(path);
  });

  it("describes the missing note in the message", () => {
    expect(new NoteNotFoundError(path).message).toBe(`Note not found: ${path}`);
  });

  it("identifies itself with kind 'note-not-found'", () => {
    expect(new NoteNotFoundError(path).kind).toBe("note-not-found");
  });
});

describe("NoteAlreadyExistsError", () => {
  it("identifies itself with kind 'note-already-exists'", () => {
    expect(new NoteAlreadyExistsError(path).kind).toBe("note-already-exists");
  });
});

describe("NoteReadError", () => {
  it("preserves the underlying cause", () => {
    const cause = new TypeError("boom");
    expect(new NoteReadError(path, cause).cause).toBe(cause);
  });

  it("identifies itself with kind 'note-read-failed'", () => {
    expect(new NoteReadError(path, new Error("x")).kind).toBe("note-read-failed");
  });
});

describe("NoteWriteError", () => {
  it("identifies itself with kind 'note-write-failed'", () => {
    expect(new NoteWriteError(path, new Error("x")).kind).toBe("note-write-failed");
  });
});

describe("NoteCreateError", () => {
  it("identifies itself with kind 'note-create-failed'", () => {
    expect(new NoteCreateError(path, new Error("x")).kind).toBe("note-create-failed");
  });
});

describe("NoteRenameError", () => {
  it("identifies itself with kind 'note-rename-failed'", () => {
    expect(new NoteRenameError(path, "new.md" as VaultPath, new Error("x")).kind).toBe("note-rename-failed");
  });

  it("carries both source and destination paths", () => {
    const error = new NoteRenameError(path, "new.md" as VaultPath, new Error("x"));
    expect(error.from).toBe(path);
    expect(error.to).toBe("new.md");
  });
});

describe("NoteDeleteError", () => {
  it("identifies itself with kind 'note-delete-failed'", () => {
    expect(new NoteDeleteError(path, new Error("x")).kind).toBe("note-delete-failed");
  });
});

describe("FrontmatterError", () => {
  it("identifies itself with kind 'frontmatter-failed'", () => {
    expect(new FrontmatterError(path, new Error("x")).kind).toBe("frontmatter-failed");
  });
});

describe("FolderNotFoundError", () => {
  it("identifies itself with kind 'folder-not-found'", () => {
    expect(new FolderNotFoundError(path).kind).toBe("folder-not-found");
  });
});

describe("WorkspaceOpenError", () => {
  it("identifies itself with kind 'workspace-open-failed'", () => {
    expect(new WorkspaceOpenError(path, new Error("x")).kind).toBe("workspace-open-failed");
  });
});

describe("PluginDataIOError", () => {
  it("identifies itself with kind 'plugin-data-io-failed'", () => {
    expect(new PluginDataIOError("load", new Error("x")).kind).toBe("plugin-data-io-failed");
  });

  it("carries the operation that failed", () => {
    expect(new PluginDataIOError("save", new Error("x")).operation).toBe("save");
  });
});
