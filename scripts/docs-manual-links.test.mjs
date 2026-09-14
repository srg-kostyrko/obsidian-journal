import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it, onTestFinished } from "vitest";

import { manual } from "../src/ui/manual.ts";
import {
  MANUAL_FILE,
  extractManualPaths,
  linkedManualPaths,
  verifyManualLinks,
  verifyRedirects,
} from "./docs-manual-links.mjs";

function sorted(values) {
  return [...new Set(values)].toSorted();
}

describe("extractManualPaths", () => {
  // The history pass can only read old tags as text. If the map's shape drifts from what the
  // pattern matches, old releases would silently contribute nothing; this is what notices.
  it("reads exactly the paths the manual map holds", () => {
    const fromSource = extractManualPaths(readFileSync(MANUAL_FILE, "utf8"));
    const fromModule = Object.values(manual).flatMap((group) => Object.values(group));

    expect(sorted(fromSource)).toEqual(sorted(fromModule));
  });

  // sitePath (docs-redirects.mjs) strips a trailing slash before lookup, so a manual.ts value
  // ending in one would be checked under a key the theme never looks up under.
  it("does not extract a path with a trailing slash", () => {
    expect(extractManualPaths('export const x = { a: "/guides/" };')).toEqual([]);
  });
});

function scratchRepo() {
  const dir = mkdtempSync(path.join(tmpdir(), "manual-links-"));
  onTestFinished(() => rmSync(dir, { recursive: true, force: true }));
  const git = (args, date = "2026-01-01T00:00:00Z") =>
    execFileSync("git", args, {
      cwd: dir,
      stdio: "pipe",
      env: { ...process.env, GIT_AUTHOR_DATE: date, GIT_COMMITTER_DATE: date },
    });
  git(["init", "-q"]);
  git(["config", "user.name", "test"]);
  git(["config", "user.email", "test@example.com"]);
  git(["config", "commit.gpgsign", "false"]);
  git(["config", "tag.gpgsign", "false"]);
  git(["config", "core.hooksPath", ".git/hooks"]);
  const writeManual = (paths) => {
    mkdirSync(path.join(dir, "src/ui"), { recursive: true });
    writeFileSync(
      path.join(dir, MANUAL_FILE),
      `export const manual = { a: { ${paths.map((p, i) => `k${i}: "${p}"`).join(", ")} } };\n`,
    );
  };
  const release = (tag, date, paths) => {
    if (paths) writeManual(paths);
    else writeFileSync(path.join(dir, "README.md"), tag);
    git(["add", "-A"], date);
    git(["commit", "-q", "-m", tag], date);
    git(["tag", tag], date);
  };
  return { dir, writeManual, release };
}

describe("linkedManualPaths", () => {
  it("attributes each path to the oldest release that shipped it", () => {
    const repo = scratchRepo();
    repo.release("0.9.0", "2026-01-01T00:00:00Z");
    repo.release("1.0.0", "2026-02-01T00:00:00Z", ["/a#x", "/b"]);
    repo.release("1.1.0", "2026-03-01T00:00:00Z", ["/b"]);
    repo.writeManual(["/b", "/c"]);

    const { paths, releasesWithLinks } = linkedManualPaths(repo.dir);

    expect(Object.fromEntries(paths)).toEqual({ "/a#x": "1.0.0", "/b": "1.0.0", "/c": null });
    expect(releasesWithLinks).toBe(2);
  });

  it("refuses a checkout without tags", () => {
    const repo = scratchRepo();
    repo.writeManual(["/a"]);

    expect(() => linkedManualPaths(repo.dir)).toThrow(/no git tags/);
  });
});

describe("verifyManualLinks", () => {
  const live = new Set(["/journals#templates", "/periods#timeline"]);
  const exists = (target) => live.has(target);

  it("accepts a path that resolves", () => {
    expect(verifyManualLinks(new Map([["/journals#templates", "3.5.0"]]), {}, exists)).toEqual([]);
  });

  it("accepts a moved path whose redirect resolves", () => {
    const redirects = { "/journals#timeline": "/periods#timeline" };
    expect(verifyManualLinks(new Map([["/journals#timeline", "3.5.0"]]), redirects, exists)).toEqual([]);
  });

  it("reports a missing path with no redirect", () => {
    expect(verifyManualLinks(new Map([["/journals#timeline", "3.5.0"]]), {}, exists)).toEqual([
      { target: "/journals#timeline", shippedIn: "3.5.0", reason: "does not exist and has no redirect" },
    ]);
  });

  it("reports a redirect that lands nowhere", () => {
    const redirects = { "/journals#timeline": "/periods#gone" };
    expect(verifyManualLinks(new Map([["/journals#timeline", null]]), redirects, exists)).toEqual([
      { target: "/journals#timeline", shippedIn: null, reason: "redirects to /periods#gone, which does not exist" },
    ]);
  });

  it("reports a redirect loop", () => {
    const redirects = { "/a": "/b", "/b": "/a" };
    expect(verifyManualLinks(new Map([["/a", "3.5.0"]]), redirects, exists)).toEqual([
      { target: "/a", shippedIn: "3.5.0", reason: "redirect loop at /a" },
    ]);
  });
});

describe("verifyRedirects", () => {
  it("reports a redirect whose source still resolves", () => {
    const exists = (target) => target === "/journals#templates";
    expect(verifyRedirects({ "/journals#templates": "/periods#weeks" }, exists)).toEqual([
      {
        target: "/journals#templates",
        shippedIn: null,
        reason: "is redirected but still exists, so readers would be sent away from it",
      },
    ]);
  });

  it("reports an unused redirect that loops", () => {
    const exists = () => false;
    expect(verifyRedirects({ "/a": "/b", "/b": "/a" }, exists)).toEqual([
      { target: "/a", shippedIn: null, reason: "redirect loop at /a" },
      { target: "/b", shippedIn: null, reason: "redirect loop at /b" },
    ]);
  });

  it("reports an unused redirect whose destination does not exist", () => {
    const exists = () => false;
    expect(verifyRedirects({ "/journals#timeline": "/periods#gone" }, exists)).toEqual([
      { target: "/journals#timeline", shippedIn: null, reason: "redirects to /periods#gone, which does not exist" },
    ]);
  });

  it("does not report a valid unused redirect", () => {
    const exists = (target) => target === "/periods#weeks";
    expect(verifyRedirects({ "/journals#timeline": "/periods#weeks" }, exists)).toEqual([]);
  });
});
