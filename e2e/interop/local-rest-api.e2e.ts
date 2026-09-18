import { browser, expect } from "@wdio/globals";

import { FixtureFileMissingError, HostPluginNotLoadedError } from "../support/errors.js";
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

function notePathsIn(folder: string): Promise<string[]> {
  return browser.executeObsidian(
    ({ app }, prefix) =>
      app.vault
        .getMarkdownFiles()
        .map((file) => file.path)
        .filter((path) => path.startsWith(prefix)),
    `${folder}/`,
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
    const body = (await response.json()) as { journals: { name: string }[] };
    expect(body.journals.map((journal) => journal.name).toSorted()).toEqual(["confirming", "mood", "work"]);
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
    // Polled rather than read once: the metadata cache re-parses each of the two writes a moment
    // after it, and the claim must be what it settles on.
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

  it("creates one note when two POSTs for the same answer-named period race", async () => {
    const [good, bad] = await Promise.all([
      postJson("/journals/mood/notes/2027-07-12", { answers: { mood: "good" } }),
      postJson("/journals/mood/notes/2027-07-12", { answers: { mood: "bad" } }),
    ]);
    // The vault first: two notes is the damage, and the statuses only say who noticed.
    expect(await notePathsIn("mood")).toHaveLength(1);
    expect([good.status, bad.status].toSorted()).toEqual([200, 201]);
  });

  it("creates a note on a confirming journal without opening a dialog", async () => {
    const response = await postJson("/journals/confirming/notes/2027-07-13", {});
    expect(response.status).toBe(201);
    await waitForJournalFrontmatter("confirming/2027-07-13.md", { journal: "confirming", date: "2027-07-13" });
    expect(await openModalCount()).toBe(0);
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
});
