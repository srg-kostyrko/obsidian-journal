import { browser, expect } from "@wdio/globals";

import {
  FixtureFileMissingError,
  HostPluginNotLoadedError,
  McpSessionIdMissingError,
  McpStreamEmptyError,
} from "../support/errors.js";
import { contentOf, frontmatterOf, waitForContent, waitForJournalFrontmatter } from "../support/vault.js";
import { waitForState } from "../support/wait.js";

// The journal routes are registered on the real Local REST API plugin, so only a real host
// exercises its express router, its auth middleware and the /vault/ handlers our 307s land on.
// The fixture turns on the host's plain-HTTP server with a fixed key, so Node's fetch reaches it
// without the self-signed certificate the HTTPS server would need trusted.
const BASE = "http://127.0.0.1:27183";
const KEY = "e2e-rest-key";
const HOST_ID = "obsidian-local-rest-api";

function rest(path: string, init: RequestInit = {}, authorized = true): Promise<Response> {
  const headers = new Headers(init.headers);
  if (authorized) headers.set("Authorization", `Bearer ${KEY}`);
  return fetch(`${BASE}${path}`, { ...init, headers });
}

function postJson(path: string, body: unknown): Promise<Response> {
  return rest(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

// Takes the prefix literally — a caller matching a whole folder passes its own trailing "/", so
// this can also scope to one date within a folder whose name template appends more after it.
function notePathsMatching(prefix: string): Promise<string[]> {
  return browser.executeObsidian(
    ({ app }, prefix) =>
      app.vault
        .getMarkdownFiles()
        .map((file) => file.path)
        .filter((path) => path.startsWith(prefix)),
    prefix,
  );
}

function openModalCount(): Promise<number> {
  return browser.execute(() => document.querySelectorAll(".modal-container").length);
}

async function hostIsLoaded(): Promise<boolean> {
  return browser.executeObsidian(({ app }, id) => {
    const plugins = (app as unknown as { plugins: { getPlugin(id: string): unknown } }).plugins;
    return plugins.getPlugin(id) !== null;
  }, HOST_ID);
}

// The MCP tools ride the host's Streamable HTTP transport (SDK 1.30), a JSON-RPC 2.0 endpoint
// distinct from the plain REST routes above: a session starts with `initialize`, whose response
// carries the `mcp-session-id` header every later call must echo, followed by a fire-and-forget
// `notifications/initialized`. A response body is either plain JSON or SSE framing — only the
// last `data:` line of an SSE body is the JSON-RPC envelope.
interface McpRpcResponse {
  readonly jsonrpc: "2.0";
  readonly id?: number;
  readonly result?: unknown;
  readonly error?: { code: number; message: string; data?: unknown };
}

async function readMcpBody(response: Response): Promise<McpRpcResponse> {
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("text/event-stream")) return (await response.json()) as McpRpcResponse;
  const text = await response.text();
  const last = text.split("\n").findLast((line) => line.startsWith("data:"));
  if (last === undefined) throw new McpStreamEmptyError();
  return JSON.parse(last.slice("data:".length).trim()) as McpRpcResponse;
}

type McpCall = (method: string, params?: Record<string, unknown>) => Promise<McpRpcResponse>;

async function mcpSession(): Promise<McpCall> {
  let sessionId: string | undefined;
  let nextId = 1;

  function send(body: Record<string, unknown>): Promise<Response> {
    const headers: Record<string, string> = {
      Authorization: `Bearer ${KEY}`,
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
    };
    if (sessionId !== undefined) headers["mcp-session-id"] = sessionId;
    return fetch(`${BASE}/mcp/`, { method: "POST", headers, body: JSON.stringify(body) });
  }

  const initResponse = await send({
    jsonrpc: "2.0",
    id: nextId++,
    method: "initialize",
    params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "e2e", version: "1" } },
  });
  const header = initResponse.headers.get("mcp-session-id");
  if (header === null) throw new McpSessionIdMissingError();
  sessionId = header;
  await readMcpBody(initResponse);

  const initializedResponse = await send({ jsonrpc: "2.0", method: "notifications/initialized" });
  expect(initializedResponse.status).toBe(202);

  return (method, params) => send({ jsonrpc: "2.0", id: nextId++, method, params }).then(readMcpBody);
}

interface McpToolResult {
  readonly isError?: boolean;
  readonly content: { type: string; text: string }[];
}

function toolContentJson<T>(response: McpRpcResponse): T {
  const result = response.result as McpToolResult;
  return JSON.parse(result.content[0]?.text ?? "{}") as T;
}

describe("local rest api interop", () => {
  before(async () => {
    await browser.reloadObsidian({
      vault: "./e2e/fixtures/e2e-rest",
      plugins: ["journals", HOST_ID],
    });
    // The host declares minAppVersion 1.13.1, above our floor, yet Obsidian loads it on the whole
    // matrix when the harness installs it. So a host that did not load is a broken install to
    // report, not a version to skip: a skip would let the run pass with no route exercised.
    if (!(await hostIsLoaded())) throw new HostPluginNotLoadedError(HOST_ID);

    // The server starts listening a debounce after the host's onload, which on a fresh vault also
    // generates an RSA key pair first; until then the port refuses connections.
    await waitForState(
      async () => {
        try {
          const response = await rest("/journals/");
          return response.status;
        } catch {
          return null;
        }
      },
      (status) => status === 200,
      "waited for the Local REST API host to serve GET /journals/",
    );
  });

  it("lists every journal", async () => {
    const response = await rest("/journals/");
    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      journals: {
        name: string;
        shelf: string | null;
        write: unknown;
        notelets: string[];
        prompts: unknown[];
        noteletTypes: unknown[];
      }[];
    };
    expect(body.journals.map((journal) => journal.name).toSorted()).toEqual(["confirming", "mood", "work"]);
    // This pins JournalInfo's full shape — the docs example is this journal's entry verbatim.
    expect(body.journals.find((journal) => journal.name === "work")).toEqual({
      name: "work",
      shelf: null,
      write: { type: "day" },
      notelets: ["Meeting"],
      prompts: [],
      noteletTypes: [{ name: "Meeting", prompts: [] }],
    });
  });

  it("creates a journal note on POST and claims it for the journal", async () => {
    const response = await postJson("/journals/work/notes/2027-07-10", {});
    expect(response.status).toBe(201);
    const body = (await response.json()) as { path: string; created: boolean };
    expect(body.path).toBe("work/2027-07-10.md");
    expect(body.created).toBe(true);

    await waitForJournalFrontmatter("work/2027-07-10.md", { journal: "work", date: "2027-07-10" });
  });

  it("redirects a read to the host's vault route for the note", async () => {
    await postJson("/journals/work/notes/2027-07-10", {});

    const redirect = await rest("/journals/work/2027-07-10/", { redirect: "manual" });
    expect(redirect.status).toBe(307);
    expect(redirect.headers.get("location")).toBe("/vault/work/2027-07-10.md");

    const followed = await rest("/journals/work/2027-07-10/");
    expect(followed.status).toBe(200);
    expect(await followed.text()).toBe(await contentOf("work/2027-07-10.md"));
  });

  it("replaces the whole note on PUT and keeps its journal claim", async () => {
    const sent = "# Replaced\n\nwritten over REST\n";
    const response = await rest("/journals/work/2027-07-11/", {
      method: "PUT",
      headers: { "Content-Type": "text/markdown" },
      body: sent,
      redirect: "manual",
    });
    expect(response.status).toBe(204);

    await waitForContent(
      "work/2027-07-11.md",
      (content) => content.includes("written over REST"),
      "waited for the PUT body to land in work/2027-07-11.md",
    );
    // Polled rather than read once: the metadata cache parses the write a moment after it lands.
    await waitForJournalFrontmatter("work/2027-07-11.md", { journal: "work", date: "2027-07-11" });
    const content = (await contentOf("work/2027-07-11.md")) ?? "";
    expect(content.replace(/^---\n[\s\S]*?\n---\n/, "")).toBe(sent);

    const resolved = await rest("/journals/work/2027-07-11/", { redirect: "manual" });
    expect(resolved.status).toBe(307);
    expect(resolved.headers.get("location")).toBe("/vault/work/2027-07-11.md");
  });

  it("refuses a PUT whose frontmatter does not parse and leaves the note as it was", async () => {
    await postJson("/journals/work/notes/2027-07-15", {});
    await waitForJournalFrontmatter("work/2027-07-15.md", { journal: "work", date: "2027-07-15" });
    const before = await contentOf("work/2027-07-15.md");

    const response = await rest("/journals/work/2027-07-15/", {
      method: "PUT",
      headers: { "Content-Type": "text/markdown" },
      body: "---\ntags: [x\n---\nbody",
    });
    expect(response.status).toBe(400);
    expect(((await response.json()) as { code: string }).code).toBe("invalid-request");

    expect(await contentOf("work/2027-07-15.md")).toBe(before);
    expect(await frontmatterOf("work/2027-07-15.md")).toMatchObject({ journal: "work" });
  });

  it("refuses a PUT whose frontmatter does not parse before creating a note for it", async () => {
    const response = await rest("/journals/work/2027-07-18/", {
      method: "PUT",
      headers: { "Content-Type": "text/markdown" },
      body: "---\ntags: [x\n---\nbody",
    });
    expect(response.status).toBe(400);
    expect(((await response.json()) as { code: string }).code).toBe("invalid-request");

    expect(await notePathsMatching("work/2027-07-18")).toEqual([]);
  });

  it("appends under a heading through the host's markdown-patch URL target", async () => {
    await postJson("/journals/work/notes/2027-07-14", {});
    await waitForJournalFrontmatter("work/2027-07-14.md", { journal: "work", date: "2027-07-14" });
    await browser.executeObsidian(async ({ app, obsidian }, path) => {
      const file = app.vault.getAbstractFileByPath(path);
      if (!(file instanceof obsidian.TFile)) throw new FixtureFileMissingError(path);
      await app.vault.process(file, (content) => `${content}\n## Log\n\nfirst entry\n\n## Later\n\nuntouched\n`);
    }, "work/2027-07-14.md");

    // Raw-content mode: the target rides in the URL suffix, the operation in a header, and the
    // text/markdown body is the content. fetch replays method and body across a 307.
    const response = await rest("/journals/work/2027-07-14/heading/Log", {
      method: "PATCH",
      headers: { "Content-Type": "text/markdown", Operation: "append" },
      body: "second entry",
    });
    expect(response.status).toBe(200);

    await waitForContent(
      "work/2027-07-14.md",
      (content) => content.includes("second entry"),
      "waited for the PATCH to append under ## Log",
    );
    const content = (await contentOf("work/2027-07-14.md")) ?? "";
    const log = content.slice(content.indexOf("## Log"), content.indexOf("## Later"));
    expect(log).toContain("first entry");
    expect(log).toContain("second entry");
    const frontmatter = await frontmatterOf("work/2027-07-14.md");
    expect(frontmatter?.journal).toBe("work");
  });

  it("renders an answer into the created note's name", async () => {
    const response = await postJson("/journals/mood/notes/2027-07-16", { answers: { mood: "great" } });
    expect(response.status).toBe(201);
    const body = (await response.json()) as { path: string; created: boolean };
    // mood's name template is "{{date}} {{mood}}" — the path is not the plain date-named one a
    // journal without a question in its name would get.
    expect(body.path).toBe("mood/2027-07-16 great.md");

    await waitForJournalFrontmatter("mood/2027-07-16 great.md", { journal: "mood", date: "2027-07-16" });
  });

  it("creates one note when two POSTs for the same answer-named period race", async () => {
    const [good, bad] = await Promise.all([
      postJson("/journals/mood/notes/2027-07-12", { answers: { mood: "good" } }),
      postJson("/journals/mood/notes/2027-07-12", { answers: { mood: "bad" } }),
    ]);
    // The vault first: two notes is the damage, and the statuses only say who noticed. Scoped to
    // this date, not the whole mood/ folder, since another test seeds a note there too.
    expect(await notePathsMatching("mood/2027-07-12")).toHaveLength(1);
    expect([good.status, bad.status].toSorted()).toEqual([200, 201]);
  });

  it("creates a note on a confirming journal without opening a dialog", async () => {
    const response = await postJson("/journals/confirming/notes/2027-07-13", {});
    expect(response.status).toBe(201);
    await waitForJournalFrontmatter("confirming/2027-07-13.md", { journal: "confirming", date: "2027-07-13" });
    expect(await openModalCount()).toBe(0);
  });

  it("creates a notelet at the path its type's folder and name template give", async () => {
    // work's Meeting type: folder "work/meetings", name template "{{date}} Meeting {{notelet_index}}".
    const response = await postJson("/journals/work/notelets/2027-07-17", { type: "Meeting" });
    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({
      journal: "work",
      type: "Meeting",
      date: "2027-07-17",
      displayDate: "2027-07-17",
      endDate: "2027-07-17",
      path: "work/meetings/2027-07-17 Meeting 1.md",
      counter: 1,
    });
    expect(await notePathsMatching("work/meetings/")).toEqual(["work/meetings/2027-07-17 Meeting 1.md"]);
  });

  describe("errors", () => {
    it("answers 404 journal-not-found for an unknown journal", async () => {
      const response = await rest("/journals/nope/");
      expect(response.status).toBe(404);
      expect(((await response.json()) as { code: string }).code).toBe("journal-not-found");
    });

    it("answers 400 invalid-date for a date that does not parse", async () => {
      const response = await postJson("/journals/work/notes/not-a-date", {});
      expect(response.status).toBe(400);
      expect(((await response.json()) as { code: string }).code).toBe("invalid-date");
    });

    it("leaves an unauthenticated request to the host's 401", async () => {
      const response = await rest("/journals/", {}, false);
      expect(response.status).toBe(401);
    });
  });

  describe("mcp tools", () => {
    it("lists all four journal tools, with journal_note_ensure requiring journal and date", async () => {
      const call = await mcpSession();
      const response = await call("tools/list");
      const result = response.result as { tools: { name: string; inputSchema: { required?: string[] } }[] };

      // The host also lists its own built-in tools (vault_read, search_query, …) on the same
      // endpoint, so this only asserts that ours are present among them, not the whole listing.
      const names = result.tools.map((tool) => tool.name);
      expect(names).toEqual(
        expect.arrayContaining(["journal_list", "journal_note_ensure", "journal_notelet_create", "journal_notes"]),
      );
      const noteEnsure = result.tools.find((tool) => tool.name === "journal_note_ensure");
      expect(noteEnsure?.inputSchema.required).toEqual(expect.arrayContaining(["journal", "date"]));
    });

    it("creates a work note through journal_note_ensure and claims it for the journal", async () => {
      const call = await mcpSession();
      const response = await call("tools/call", {
        name: "journal_note_ensure",
        arguments: { journal: "work", date: "2026-10-05" },
      });

      const result = response.result as McpToolResult;
      expect(result.isError).toBeFalsy();
      const body = toolContentJson<{ created: boolean; path: string }>(response);
      expect(body.created).toBe(true);
      expect(body.path).toBe("work/2026-10-05.md");

      await waitForJournalFrontmatter("work/2026-10-05.md", { journal: "work", date: "2026-10-05" });
      expect(await openModalCount()).toBe(0);
    });

    it("finds the note journal_note_ensure created through journal_notes", async () => {
      const call = await mcpSession();
      const response = await call("tools/call", {
        name: "journal_notes",
        arguments: { journal: "work", from: "2026-10-05" },
      });

      const result = response.result as McpToolResult;
      expect(result.isError).toBeFalsy();
      const body = toolContentJson<{ notes: { path: string }[] }>(response);
      expect(body.notes.map((note) => note.path)).toContain("work/2026-10-05.md");
    });

    it("returns tool-error content for an unknown journal", async () => {
      const call = await mcpSession();
      const response = await call("tools/call", {
        name: "journal_note_ensure",
        arguments: { journal: "nope", date: "today" },
      });

      const result = response.result as McpToolResult;
      expect(result.isError).toBe(true);
      const body = toolContentJson<{ code: string }>(response);
      expect(body.code).toBe("journal-not-found");
    });

    it("refuses a call missing the required journal argument, naming the field", async () => {
      const call = await mcpSession();
      const response = await call("tools/call", {
        name: "journal_note_ensure",
        arguments: { date: "today" },
      });

      // The forged `_parse` runs inside the real host's own z.object() validation, before our
      // tool's `call` ever runs — so the SDK may answer either a tool-error result or a JSON-RPC
      // error, and either way it must name the missing field.
      const result = response.result as McpToolResult | undefined;
      const isToolError = result?.isError === true;
      expect(isToolError || response.error !== undefined).toBe(true);
      const text = isToolError ? (result?.content[0]?.text ?? "") : (response.error?.message ?? "");
      expect(text).toContain("journal");
    });
  });
});
