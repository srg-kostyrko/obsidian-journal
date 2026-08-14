import { describe, expect, it } from "vitest";

import { Container } from "@/infrastructure/di";
import { expectErr, expectOk } from "@/infrastructure/result/testing";

import { PluginDataIOError } from "../errors";

import { PluginData } from "./plugin-data";
import { createFakeHost, type FakeHost } from "./testing";
import { InternalPluginToken } from "./tokens";

function build(): { service: PluginData; host: FakeHost } {
  const host = createFakeHost();
  const c = new Container();
  c.register(InternalPluginToken).useValue(host.plugin);
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
