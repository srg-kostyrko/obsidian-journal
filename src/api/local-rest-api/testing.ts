import { LOCAL_REST_API_PLUGIN_ID } from "obsidian-local-rest-api";
import { expect, vi, type Mock } from "vitest";

import type { JournalConfig } from "@/journals/config";
import { journalsCoreModule } from "@/journals/module";
import { fixedJournal } from "@/journals/testing";
import { VaultSubscriptionService } from "@/journals/vault-subscription";
import { shelvesCoreModule } from "@/shelves/module";
import { testContainer, type TestHarness } from "@/testing";

import { JournalsApiService } from "../journals-api";
import { apiModule } from "../module";

import { LocalRestApiBridge } from "./local-rest-api-bridge";

import type { RestVerb } from "./route";
import type { IRoute, Request, Response } from "express";

type HostHandler = (request: Request, response: Response) => void;

/** One MCP tool exactly as the host would have recorded it from `addMcpTool`. */
export interface RecordedTool {
  readonly description: string;
  readonly schema: Record<string, unknown>;
  readonly callback: (arguments_: Record<string, unknown>) => Promise<unknown>;
  readonly annotations: unknown;
}

export interface RecordingLocalRestApi {
  /** Every handler added through `api`, keyed `"<verb> <path>"`. */
  readonly handlers: Map<string, HostHandler>;
  /** Every tool added through `api`, keyed by name. */
  readonly tools: Map<string, RecordedTool>;
  readonly api: {
    readonly apiVersion: number;
    readonly addRoute: Mock<(path: string) => IRoute>;
    readonly addPublicRoute: Mock;
    readonly addMcpTool: Mock;
    readonly unregister: Mock;
  };
}

/** A Local REST API public handle that records every handler and tool added through it. */
export function recordingLocalRestApi(): RecordingLocalRestApi {
  const handlers = new Map<string, HostHandler>();
  const tools = new Map<string, RecordedTool>();
  const addRoute = vi.fn((path: string) => {
    const route: Record<string, unknown> = {};
    for (const method of ["get", "post", "put", "patch", "delete"]) {
      route[method] = (handler: HostHandler) => {
        handlers.set(`${method} ${path}`, handler);
        return route;
      };
    }
    return route as unknown as IRoute;
  });
  const addMcpTool = vi.fn(
    (
      name: string,
      description: string,
      schema: Record<string, unknown>,
      callback: (arguments_: Record<string, unknown>) => Promise<unknown>,
      annotations: unknown,
    ) => {
      tools.set(name, { description, schema, callback, annotations });
    },
  );
  return {
    handlers,
    tools,
    api: { apiVersion: 2, addRoute, addPublicRoute: vi.fn(), addMcpTool, unregister: vi.fn() },
  };
}

export interface FakeResponse {
  statusCode: number | undefined;
  body: unknown;
  headers: Record<string, string>;
  redirected: { status: number; url: string } | undefined;
  ended: boolean;
}

// onRedirect lets a test observe when redirect() fires relative to other work, without reaching
// for response.redirect as a bare member reference elsewhere — Response#redirect is an overloaded
// type with a deprecated single-arg signature, and @typescript-eslint/no-deprecated flags any
// reference to the member, not just calls matching the deprecated overload.
export function fakeResponse(onRedirect?: () => void): FakeResponse & Response {
  const response = {
    statusCode: undefined as number | undefined,
    body: undefined as unknown,
    headers: {} as Record<string, string>,
    redirected: undefined as { status: number; url: string } | undefined,
    ended: false,
    status(code: number) {
      response.statusCode = code;
      return response;
    },
    json(body: unknown) {
      response.body = body;
      return response;
    },
    set(name: string, value: string) {
      response.headers[name] = value;
      return response;
    },
    end() {
      response.ended = true;
      return response;
    },
    redirect(status: number, url: string) {
      response.redirected = { status, url };
      onRedirect?.();
    },
  };
  return response as unknown as FakeResponse & Response;
}

export function fakeRequest(
  overrides: Partial<{
    params: Record<string, string>;
    query: Record<string, unknown>;
    body: unknown;
    headers: Record<string, string>;
    method: string;
    // Still percent-encoded, exactly as Express's own req.path is — see readSuffix in request.ts.
    path: string;
    // Express's req.originalUrl: the path as received, query string included.
    originalUrl: string;
  }> = {},
): Request {
  return {
    params: {},
    query: {},
    body: undefined,
    headers: {},
    method: "GET",
    path: "",
    originalUrl: "",
    ...overrides,
  } as unknown as Request;
}

export interface RestHarness {
  readonly harness: TestHarness;
  readonly api: JournalsApiService;
  readonly host: RecordingLocalRestApi;
  /** Runs the handler the bridge registered for `verb path` through the host-facing error wrapper. */
  send(
    verb: RestVerb,
    path: string,
    request?: Request,
    response?: FakeResponse & Response,
  ): Promise<FakeResponse & Response>;
  /** Runs the callback the bridge registered for a tool, exactly as the host would call it. */
  callTool(name: string, arguments_: Record<string, unknown>): Promise<unknown>;
}

/** Boots the real API module with its bridge registered on a recording host. Seeds a `work` day journal by default. */
export async function restHarness(journals?: Record<string, JournalConfig>): Promise<RestHarness> {
  const harness = await testContainer({
    modules: [journalsCoreModule, shelvesCoreModule, apiModule],
    data: { journals: journals ?? { work: fixedJournal("work", { type: "day" }) }, shelves: {} },
    initialize: [VaultSubscriptionService],
  });
  const host = recordingLocalRestApi();
  harness.host.putPlugin(LOCAL_REST_API_PLUGIN_ID, { getPublicApi: () => host.api });
  harness.resolve(LocalRestApiBridge).initialize();

  async function send(
    verb: RestVerb,
    path: string,
    request: Request = fakeRequest(),
    response: FakeResponse & Response = fakeResponse(),
  ): Promise<FakeResponse & Response> {
    const handler = host.handlers.get(`${verb} ${path}`);
    if (handler === undefined) throw new Error(`no route registered for ${verb} ${path}`);
    handler(request, response);
    // A redirect answers through response.redirect alone, never response.status.
    await vi.waitFor(() => {
      expect(response.statusCode ?? response.redirected).not.toBeUndefined();
    });
    return response;
  }

  function callTool(name: string, arguments_: Record<string, unknown>): Promise<unknown> {
    const tool = host.tools.get(name);
    if (tool === undefined) throw new Error(`no tool registered for ${name}`);
    return tool.callback(arguments_);
  }

  return { harness, api: harness.resolve(JournalsApiService), host, send, callTool };
}
