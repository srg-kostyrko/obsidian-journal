import { describe, expect, it, vi } from "vitest";

import { Container } from "@/infrastructure/di";
import { expectErr, expectOk } from "@/infrastructure/result/testing";

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
} from "../errors";

import { NotesService } from "./notes-service";
import { createFakeHost, type FakeHost } from "./testing";
import { InternalObsidianAppToken, InternalPluginToken } from "./tokens";

import type { Note, VaultPath } from "../types";

function build(): { service: NotesService; host: FakeHost } {
  const host = createFakeHost();
  const c = new Container();
  c.register(InternalPluginToken).useValue(host.plugin);
  c.register(InternalObsidianAppToken).useValue(host.app);
  c.register(NotesService).useClass(NotesService);
  return { service: c.resolve(NotesService), host };
}

const path = "Daily/2026-05-13.md" as VaultPath;
const otherPath = "Daily/2026-05-14.md" as VaultPath;

describe("NotesService", () => {
  describe("find", () => {
    it("returns Some(Note) when the file exists", () => {
      const { service, host } = build();
      host.putFile(path);
      const option = service.find(path);
      expect(option.getOr(null as unknown as Note)).toEqual<Note>({
        path,
        basename: "2026-05-13",
        folder: "Daily" as VaultPath,
      });
    });

    it("returns None when the file does not exist", () => {
      const { service } = build();
      expect(service.find(path).isNone()).toBe(true);
    });
  });

  describe("listInFolder", () => {
    it("returns markdown paths inside the folder recursively", async () => {
      const { service, host } = build();
      host.putFile("Daily/2026-05-13.md");
      host.putFile("Daily/2026/05/2026-05-14.md");
      host.putFile("Other/note.md");
      const result = await service.listInFolder("Daily" as VaultPath);
      expectOk(result);
      expect(result.value.toSorted()).toEqual(["Daily/2026-05-13.md", "Daily/2026/05/2026-05-14.md"]);
    });

    it("returns FolderNotFoundError when the folder does not exist", async () => {
      const { service } = build();
      const result = await service.listInFolder("Nope" as VaultPath);
      expectErr(result);
      expect(result.error).toBeInstanceOf(FolderNotFoundError);
    });
  });

  describe("allMarkdownNotes", () => {
    it("returns every markdown file path", () => {
      const { service, host } = build();
      host.putFile("a.md");
      host.putFile("b/c.md");
      expect(service.allMarkdownNotes().toSorted()).toEqual(["a.md", "b/c.md"]);
    });
  });

  describe("listFolders", () => {
    it("returns every loaded folder path including the root as empty string", () => {
      const { service, host } = build();
      host.putFolder("Daily");
      host.putFolder("Daily/Archives");
      host.putFolder("Other");
      expect(service.listFolders().toSorted()).toEqual(["", "Daily", "Daily/Archives", "Other"]);
    });
  });

  describe("create", () => {
    it("creates the file with the given content", async () => {
      const { service, host } = build();
      const result = await service.create(path, "hello");
      expectOk(result);
      expect(host.files.get(path)?.content).toBe("hello");
    });

    it("returns the new Note record", async () => {
      const { service } = build();
      const result = await service.create(path, "");
      expectOk(result);
      expect(result.value.path).toBe(path);
    });

    it("returns NoteAlreadyExistsError when the path already exists", async () => {
      const { service, host } = build();
      host.putFile(path);
      const result = await service.create(path, "x");
      expectErr(result);
      expect(result.error).toBeInstanceOf(NoteAlreadyExistsError);
    });

    it("creates the parent folder when it does not exist", async () => {
      const { service, host } = build();
      const result = await service.create("Brand/New/Folder/note.md" as VaultPath, "");
      expectOk(result);
      expect(host.folders.has("Brand/New/Folder")).toBe(true);
    });

    it("wraps an underlying vault failure in NoteCreateError", async () => {
      const { service, host } = build();
      vi.spyOn(host.app.vault, "create").mockRejectedValueOnce(new Error("disk full"));
      const result = await service.create(path, "");
      expectErr(result);
      expect(result.error).toBeInstanceOf(NoteCreateError);
    });
  });

  describe("read", () => {
    it("returns the file's content", async () => {
      const { service, host } = build();
      host.putFile(path, "body");
      const result = await service.read(path);
      expectOk(result);
      expect(result.value).toBe("body");
    });

    it("returns NoteNotFoundError when the file does not exist", async () => {
      const { service } = build();
      const result = await service.read(path);
      expectErr(result);
      expect(result.error).toBeInstanceOf(NoteNotFoundError);
    });

    it("wraps an underlying read failure in NoteReadError", async () => {
      const { service, host } = build();
      host.putFile(path);
      vi.spyOn(host.app.vault, "read").mockRejectedValueOnce(new Error("io"));
      const result = await service.read(path);
      expectErr(result);
      expect(result.error).toBeInstanceOf(NoteReadError);
    });
  });

  describe("write", () => {
    it("replaces the file's content", async () => {
      const { service, host } = build();
      host.putFile(path, "old");
      const result = await service.write(path, "new");
      expectOk(result);
      expect(host.files.get(path)?.content).toBe("new");
    });

    it("returns NoteNotFoundError when the file does not exist", async () => {
      const { service } = build();
      const result = await service.write(path, "x");
      expectErr(result);
      expect(result.error).toBeInstanceOf(NoteNotFoundError);
    });

    it("wraps an underlying modify failure in NoteWriteError", async () => {
      const { service, host } = build();
      host.putFile(path);
      vi.spyOn(host.app.vault, "modify").mockRejectedValueOnce(new Error("io"));
      const result = await service.write(path, "x");
      expectErr(result);
      expect(result.error).toBeInstanceOf(NoteWriteError);
    });
  });

  describe("append", () => {
    it("appends to the file's content", async () => {
      const { service, host } = build();
      host.putFile(path, "a");
      await service.append(path, "b");
      expect(host.files.get(path)?.content).toBe("ab");
    });

    it("returns NoteNotFoundError when the file does not exist", async () => {
      const { service } = build();
      const result = await service.append(path, "x");
      expectErr(result);
      expect(result.error).toBeInstanceOf(NoteNotFoundError);
    });

    it("wraps an underlying append failure in NoteWriteError", async () => {
      const { service, host } = build();
      host.putFile(path);
      vi.spyOn(host.app.vault, "append").mockRejectedValueOnce(new Error("io"));
      const result = await service.append(path, "x");
      expectErr(result);
      expect(result.error).toBeInstanceOf(NoteWriteError);
    });
  });

  describe("rename", () => {
    it("moves the file to the new path", async () => {
      const { service, host } = build();
      host.putFile(path, "body");
      const result = await service.rename(path, otherPath);
      expectOk(result);
      expect(host.files.has(otherPath)).toBe(true);
      expect(host.files.has(path)).toBe(false);
    });

    it("returns NoteNotFoundError when the source does not exist", async () => {
      const { service } = build();
      const result = await service.rename(path, otherPath);
      expectErr(result);
      expect(result.error).toBeInstanceOf(NoteNotFoundError);
    });

    it("returns NoteAlreadyExistsError when the destination already exists", async () => {
      const { service, host } = build();
      host.putFile(path);
      host.putFile(otherPath);
      const result = await service.rename(path, otherPath);
      expectErr(result);
      expect(result.error).toBeInstanceOf(NoteAlreadyExistsError);
    });

    it("wraps an underlying rename failure in NoteRenameError", async () => {
      const { service, host } = build();
      host.putFile(path);
      vi.spyOn(host.app.vault, "rename").mockRejectedValueOnce(new Error("io"));
      const result = await service.rename(path, otherPath);
      expectErr(result);
      expect(result.error).toBeInstanceOf(NoteRenameError);
    });
  });

  describe("delete", () => {
    it("removes the file from the vault", async () => {
      const { service, host } = build();
      host.putFile(path);
      await service.delete(path);
      expect(host.files.has(path)).toBe(false);
    });

    it("returns NoteNotFoundError when the file does not exist", async () => {
      const { service } = build();
      const result = await service.delete(path);
      expectErr(result);
      expect(result.error).toBeInstanceOf(NoteNotFoundError);
    });

    it("wraps an underlying delete failure in NoteDeleteError", async () => {
      const { service, host } = build();
      host.putFile(path);
      vi.spyOn(host.app.fileManager, "trashFile").mockRejectedValueOnce(new Error("io"));
      const result = await service.delete(path);
      expectErr(result);
      expect(result.error).toBeInstanceOf(NoteDeleteError);
    });
  });

  describe("updateFrontmatter", () => {
    it("applies the mutate function to the frontmatter", async () => {
      const { service, host } = build();
      host.putFile(path);
      await service.updateFrontmatter(path, (fm) => {
        fm.tag = "daily";
      });
      expect(host.files.get(path)?.frontmatter).toEqual({ tag: "daily" });
    });

    it("returns NoteNotFoundError when the file does not exist", async () => {
      const { service } = build();
      const result = await service.updateFrontmatter(path, () => undefined);
      expectErr(result);
      expect(result.error).toBeInstanceOf(NoteNotFoundError);
    });

    it("wraps an underlying processFrontMatter failure in FrontmatterError", async () => {
      const { service, host } = build();
      host.putFile(path);
      vi.spyOn(host.app.fileManager, "processFrontMatter").mockRejectedValueOnce(new Error("yaml"));
      const result = await service.updateFrontmatter(path, () => undefined);
      expectErr(result);
      expect(result.error).toBeInstanceOf(FrontmatterError);
    });
  });

  describe("events.created", () => {
    it("fires when a vault file is created", () => {
      const { service, host } = build();
      const captured: { path: string; basename: string }[] = [];
      service.events.on("created", (note) => captured.push({ path: note.path, basename: note.basename }));
      const file = host.putFile(path);
      host.emitVault("create", file);
      expect(captured).toEqual([{ path, basename: "2026-05-13" }]);
    });
  });

  describe("events.renamed", () => {
    it("fires with from/to when a vault file is renamed", () => {
      const { service, host } = build();
      let event: { from: VaultPath; to: VaultPath } | undefined;
      service.events.on("renamed", (renamed) => {
        event = renamed;
      });
      const file = host.putFile(path);
      const oldPath = file.path;
      file.path = otherPath;
      host.emitVault("rename", file, oldPath);
      expect(event).toEqual({ from: oldPath, to: otherPath });
    });
  });

  describe("events.deleted", () => {
    it("fires with the path of the deleted file", () => {
      const { service, host } = build();
      const captured: VaultPath[] = [];
      service.events.on("deleted", (p) => captured.push(p));
      const file = host.putFile(path);
      host.emitVault("delete", file);
      expect(captured).toEqual([path]);
    });
  });

  describe("events.metadata-changed", () => {
    it("fires with the path of the file whose metadata changed", () => {
      const { service, host } = build();
      const captured: VaultPath[] = [];
      service.events.on("metadata-changed", (p) => captured.push(p));
      host.putFile(path);
      host.emitMetadata(path);
      expect(captured).toEqual([path]);
    });
  });

  describe("subscription lifecycle", () => {
    it("stops invoking the handler after unbind", () => {
      const { service, host } = build();
      let count = 0;
      const unbind = service.events.on("created", () => {
        count += 1;
      });
      const file = host.putFile(path);
      host.emitVault("create", file);
      unbind();
      const file2 = host.putFile(otherPath);
      host.emitVault("create", file2);
      expect(count).toBe(1);
    });
  });
});
