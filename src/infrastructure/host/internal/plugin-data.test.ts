import { describe, expect, it } from "vitest";

import { Container } from "@/infrastructure/di";
import { expectErr, expectOk } from "@/infrastructure/result/testing";

import { PluginDataIOError } from "../errors";

import { PluginData } from "./plugin-data";
import { createFakeHost, type FakeHost } from "./testing";
import { InternalObsidianAppToken, InternalPluginToken } from "./tokens";

import type { App, Plugin } from "obsidian";

function build(): { service: PluginData; host: FakeHost } {
  const host = createFakeHost();
  const c = new Container();
  c.register(InternalPluginToken).useValue(host.plugin);
  c.register(InternalObsidianAppToken).useValue(host.app);
  c.register(PluginData).useClass(PluginData);
  return { service: c.resolve(PluginData), host };
}

describe("PluginData", () => {
  describe("load", () => {
    it("returns the data previously stored by plugin.loadData", async () => {
      const { service, host } = build();
      host.pluginData.current = { hello: "world" };
      const result = await service.load();
      expectOk(result);
      expect(result.value).toEqual({ hello: "world" });
    });

    it("surfaces an underlying loadData failure as PluginDataIOError", async () => {
      const { service, host } = build();
      const cause = new Error("disk failure");
      host.pluginData.loadError = cause;
      const result = await service.load();
      expectErr(result);
      expect(result.error).toBeInstanceOf(PluginDataIOError);
      expect(result.error.operation).toBe("load");
      expect(result.error.cause).toBe(cause);
    });
  });

  describe("save", () => {
    it("persists the payload via plugin.saveData", async () => {
      const { service, host } = build();
      const result = await service.save({ hello: "world" });
      expectOk(result);
      expect(host.pluginData.current).toEqual({ hello: "world" });
    });

    it("surfaces an underlying saveData failure as PluginDataIOError", async () => {
      const { service, host } = build();
      const cause = new Error("readonly fs");
      host.pluginData.saveError = cause;
      const result = await service.save({});
      expectErr(result);
      expect(result.error).toBeInstanceOf(PluginDataIOError);
      expect(result.error.operation).toBe("save");
      expect(result.error.cause).toBe(cause);
    });
  });
});

function buildFileAccess(files: Record<string, string> = {}): { data: PluginData; files: Record<string, string> } {
  const adapter = {
    list: (path: string) =>
      Promise.resolve({ files: Object.keys(files).filter((f) => f.startsWith(`${path}/`)), folders: [] }),
    read: (path: string) => {
      const found = files[path];
      return found === undefined ? Promise.reject(new Error("missing")) : Promise.resolve(found);
    },
    write: (path: string, contents: string) => {
      files[path] = contents;
      return Promise.resolve();
    },
    remove: (path: string) => {
      delete files[path];
      return Promise.resolve();
    },
  };
  const c = new Container();
  const pluginDirectory = ".obsidian/plugins/journal";
  c.register(InternalPluginToken).useValue({ manifest: { dir: pluginDirectory } } as unknown as Plugin);
  c.register(InternalObsidianAppToken).useValue({ vault: { adapter } } as unknown as App);
  c.register(PluginData).useClass(PluginData);
  return { data: c.resolve(PluginData), files };
}

describe("PluginData file access", () => {
  it("writes a file into the plugin's own directory", async () => {
    const { data, files } = buildFileAccess();
    const pluginDirectory = ".obsidian/plugins/journal";

    expectOk(await data.writeFile("backup-v3.json", '{"a":1}'));

    expect(files[`${pluginDirectory}/backup-v3.json`]).toBe('{"a":1}');
  });

  it("reads a file back", async () => {
    const pluginDirectory = ".obsidian/plugins/journal";
    const { data } = buildFileAccess({ [`${pluginDirectory}/backup-v3.json`]: '{"a":1}' });

    const result = await data.readFile("backup-v3.json");

    expectOk(result);
    expect(result.value).toBe('{"a":1}');
  });

  it("lists file names without their directory", async () => {
    const pluginDirectory = ".obsidian/plugins/journal";
    const { data } = buildFileAccess({
      [`${pluginDirectory}/backup-v3.json`]: "{}",
      [`${pluginDirectory}/data.json`]: "{}",
    });

    const result = await data.listFiles();

    expectOk(result);
    expect(result.value).toEqual(["backup-v3.json", "data.json"]);
  });

  it("deletes a file", async () => {
    const pluginDirectory = ".obsidian/plugins/journal";
    const { data, files } = buildFileAccess({ [`${pluginDirectory}/backup-v3.json`]: "{}" });

    expectOk(await data.deleteFile("backup-v3.json"));

    expect(files[`${pluginDirectory}/backup-v3.json`]).toBeUndefined();
  });

  it("refuses a name that escapes the plugin directory", async () => {
    const { data, files } = buildFileAccess();

    const result = await data.writeFile("../../../evil.json", "{}");

    expectErr(result);
    expect(Object.keys(files)).toEqual([]);
  });

  it("surfaces an adapter failure as PluginDataIOError", async () => {
    const { data } = buildFileAccess();

    const result = await data.readFile("missing.json");

    expectErr(result);
    expect(result.error.operation).toBe("read-file");
  });
});
