import { describe, expect, it } from "vitest";

import { Container } from "@/infrastructure/di";
import { Some } from "@/infrastructure/result";
import { expectErr, expectOk } from "@/infrastructure/result/testing";

import { WorkspaceOpenError } from "../errors";

import { createFakeHost } from "./testing";
import { InternalObsidianAppToken, InternalPluginToken } from "./tokens";
import { WorkspaceService } from "./workspace-service";

import type { FakeHost } from "./testing";
import type { VaultPath } from "../types";

function build(): { service: WorkspaceService; host: FakeHost } {
  const host = createFakeHost();
  const c = new Container();
  c.register(InternalPluginToken).useValue(host.plugin);
  c.register(InternalObsidianAppToken).useValue(host.app);
  c.register(WorkspaceService).useClass(WorkspaceService);
  return { service: c.resolve(WorkspaceService), host };
}

const path = "Daily/2026-05-13.md" as VaultPath;

describe("WorkspaceService", () => {
  describe("activeNote", () => {
    it("returns None when no markdown file is active", () => {
      const { service } = build();
      expect(service.activeNote().isNone()).toBe(true);
    });

    it("returns the active file's path when one is active", () => {
      const { service, host } = build();
      const file = host.putFile(path);
      host.workspace.activeFile = file;
      const result = service.activeNote();
      expect(result).toBeInstanceOf(Some);
      expect(result.getOr("" as VaultPath)).toBe(path);
    });
  });

  describe("isOpen", () => {
    it("returns false when the path is not open in any leaf", () => {
      const { service } = build();
      expect(service.isOpen(path)).toBe(false);
    });

    it("returns true after openNote succeeds for the path", async () => {
      const { service, host } = build();
      host.putFile(path);
      await service.openNote(path);
      expect(service.isOpen(path)).toBe(true);
    });
  });

  describe("openNote", () => {
    it("opens the file using the default 'active' mode", async () => {
      const { service, host } = build();
      host.putFile(path);
      const result = await service.openNote(path);
      expectOk(result);
      expect(host.workspace.openCalls).toEqual([{ path, mode: false }]);
    });

    it("translates 'tab' mode to PaneType 'tab'", async () => {
      const { service, host } = build();
      host.putFile(path);
      await service.openNote(path, "tab");
      expect(host.workspace.openCalls.at(-1)?.mode).toBe("tab");
    });

    it("returns WorkspaceOpenError when the path is unknown", async () => {
      const { service } = build();
      const result = await service.openNote(path);
      expectErr(result);
      expect(result.error).toBeInstanceOf(WorkspaceOpenError);
    });
  });

  describe("events.active-note-changed", () => {
    it("emits Some(path) when a markdown file becomes active", () => {
      const { service, host } = build();
      const file = host.putFile(path);
      const received: (Some<VaultPath> | undefined)[] = [];
      service.events.on("active-note-changed", (option) =>
        received.push(option.match({ some: (p) => new Some(p), none: () => undefined })),
      );
      host.emitActiveLeafChange(file);
      expect(received).toHaveLength(1);
      expect(received[0]?.value).toBe(path);
    });

    it("emits None when active leaf has no markdown file", () => {
      const { service, host } = build();
      let isNone = false;
      service.events.on("active-note-changed", (option) => {
        isNone = option.isNone();
      });
      host.emitActiveLeafChange(null);
      expect(isNone).toBe(true);
    });

    it("stops invoking the handler after unbind", () => {
      const { service, host } = build();
      const file = host.putFile(path);
      let count = 0;
      const unbind = service.events.on("active-note-changed", () => {
        count += 1;
      });
      host.emitActiveLeafChange(file);
      unbind();
      host.emitActiveLeafChange(null);
      expect(count).toBe(1);
    });
  });
});
