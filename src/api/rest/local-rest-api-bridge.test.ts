import { LOCAL_REST_API_PLUGIN_ID } from "obsidian-local-rest-api";
import { describe, expect, it, vi } from "vitest";

import { LogLevelGateToken } from "@/infrastructure/logger";
import { journalsCoreModule } from "@/journals/module";
import { shelvesCoreModule } from "@/shelves/module";
import { testContainer, type TestHarness } from "@/testing";

import { apiModule } from "../module";

import { LocalRestApiBridge } from "./local-rest-api-bridge";

import type { IRoute } from "express";

const HOST_LOADED_EVENT = "obsidian-local-rest-api:loaded";

function chainableRoute(): IRoute {
  const get = vi.fn();
  const route = { get } as unknown as IRoute;
  get.mockReturnValue(route);
  return route;
}

function fakeLocalRestApi() {
  return {
    apiVersion: 2,
    addRoute: vi.fn(() => chainableRoute()),
    addPublicRoute: vi.fn(),
    addMcpTool: vi.fn(),
    unregister: vi.fn(),
  };
}

function buildHarness(): Promise<TestHarness> {
  return testContainer({
    modules: [journalsCoreModule, shelvesCoreModule, apiModule],
    data: { journals: {}, shelves: {} },
  });
}

describe("LocalRestApiBridge", () => {
  it("registers nothing and does not throw when no host is installed", async () => {
    const harness = await buildHarness();
    const bridge = harness.resolve(LocalRestApiBridge);

    expect(() => bridge.initialize()).not.toThrow();
  });

  it("registers journal routes when the host is already installed", async () => {
    const harness = await buildHarness();
    const api = fakeLocalRestApi();
    harness.host.putPlugin(LOCAL_REST_API_PLUGIN_ID, { getPublicApi: () => api });
    const bridge = harness.resolve(LocalRestApiBridge);

    bridge.initialize();

    expect(api.addRoute).toHaveBeenCalled();
  });

  it("unregisters the previous handle and registers again when the host reloads", async () => {
    const harness = await buildHarness();
    const first = fakeLocalRestApi();
    harness.host.putPlugin(LOCAL_REST_API_PLUGIN_ID, { getPublicApi: () => first });
    const bridge = harness.resolve(LocalRestApiBridge);
    bridge.initialize();

    const second = fakeLocalRestApi();
    harness.host.putPlugin(LOCAL_REST_API_PLUGIN_ID, { getPublicApi: () => second });
    harness.host.emitWorkspace(HOST_LOADED_EVENT);

    expect(first.unregister).toHaveBeenCalled();
    expect(second.addRoute).toHaveBeenCalled();
  });

  it("registers journal routes once the host installs after initialize", async () => {
    const harness = await buildHarness();
    const bridge = harness.resolve(LocalRestApiBridge);
    bridge.initialize();

    const api = fakeLocalRestApi();
    harness.host.putPlugin(LOCAL_REST_API_PLUGIN_ID, { getPublicApi: () => api });
    harness.host.emitWorkspace(HOST_LOADED_EVENT);

    expect(api.addRoute).toHaveBeenCalled();
  });

  it("unregisters the active handle on dispose", async () => {
    const harness = await buildHarness();
    const api = fakeLocalRestApi();
    harness.host.putPlugin(LOCAL_REST_API_PLUGIN_ID, { getPublicApi: () => api });
    const bridge = harness.resolve(LocalRestApiBridge);
    bridge.initialize();

    bridge[Symbol.dispose]();

    expect(api.unregister).toHaveBeenCalled();
  });

  it("logs at debug and registers nothing when the host's getAPI throws", async () => {
    const harness = await buildHarness();
    harness.resolve(LogLevelGateToken).setThreshold("debug");
    harness.host.putPlugin(LOCAL_REST_API_PLUGIN_ID, {
      getPublicApi: () => {
        throw new Error("boom");
      },
    });
    const bridge = harness.resolve(LocalRestApiBridge);

    expect(() => bridge.initialize()).not.toThrow();

    expect(harness.logs.records).toContainEqual(
      expect.objectContaining({
        level: "debug",
        name: "local-rest-api",
        message: "local rest api registration failed",
      }),
    );
  });
});
