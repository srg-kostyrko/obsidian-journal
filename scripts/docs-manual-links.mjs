import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";

import { MAX_REDIRECT_HOPS, redirectTarget } from "./docs-redirects.mjs";

export const MANUAL_FILE = "src/ui/manual.ts";

const MANUAL_PATH = /"(\/[a-z0-9/-]*(?:#[a-z0-9-]+)?)"/g;

export function extractManualPaths(source) {
  return [...new Set([...source.matchAll(MANUAL_PATH)].map((match) => match[1]))];
}

function git(cwd, args) {
  return execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
}

// Every tag rather than the tags containing the commit that added the file: in a shallow clone
// that commit resolves to the shallow boundary, no tag contains it, and the pass would check nothing.
export function linkedManualPaths(cwd) {
  const tags = git(cwd, ["tag", "--sort=creatordate"]).split("\n").filter(Boolean);
  if (tags.length === 0)
    throw new Error(
      "no git tags in this checkout, so links shipped by past releases cannot be checked — fetch tags first",
    );
  const paths = new Map();
  let releasesWithLinks = 0;
  for (const tag of tags) {
    if (git(cwd, ["ls-tree", "--name-only", tag, "--", MANUAL_FILE]).trim() === "") continue;
    releasesWithLinks++;
    for (const target of extractManualPaths(git(cwd, ["show", `${tag}:${MANUAL_FILE}`])))
      if (!paths.has(target)) paths.set(target, tag);
  }
  for (const target of extractManualPaths(readFileSync(path.join(cwd, MANUAL_FILE), "utf8")))
    if (!paths.has(target)) paths.set(target, null);
  return { paths, releasesWithLinks };
}

export function verifyManualLinks(paths, redirects, exists) {
  const failures = [];
  for (const [target, shippedIn] of paths) {
    if (exists(target)) continue;
    const result = redirectTarget(redirects, target);
    let reason;
    if ("error" in result)
      reason = result.error === "loop" ? `redirect loop at ${result.path}` : `more than ${MAX_REDIRECT_HOPS} redirects`;
    else if (result.hops === 0) reason = "does not exist and has no redirect";
    else if (!exists(result.path)) reason = `redirects to ${result.path}, which does not exist`;
    if (reason) failures.push({ target, shippedIn, reason });
  }
  return failures;
}

export function verifyRedirects(redirects, exists) {
  return Object.keys(redirects)
    .filter((source) => exists(source))
    .map((target) => ({
      target,
      shippedIn: null,
      reason: "is redirected but still exists, so readers would be sent away from it",
    }));
}
