import { describe, expect, it } from "vitest";
import { redirectTarget, sitePath } from "./docs-redirects.mjs";

describe("sitePath", () => {
  it("strips the base from a page path", () => {
    expect(sitePath("/obsidian-journal/journals", "#note-creation", "/obsidian-journal/")).toBe(
      "/journals#note-creation",
    );
  });

  it("drops a .html suffix", () => {
    expect(sitePath("/obsidian-journal/reference/links.html", "", "/obsidian-journal/")).toBe("/reference/links");
  });

  it("drops a trailing slash", () => {
    expect(sitePath("/obsidian-journal/guides/", "", "/obsidian-journal/")).toBe("/guides");
  });

  it("maps the site root to a slash", () => {
    expect(sitePath("/obsidian-journal/", "", "/obsidian-journal/")).toBe("/");
  });
});

describe("redirectTarget", () => {
  it("returns the target unchanged when nothing redirects it", () => {
    expect(redirectTarget({}, "/journals#timeline")).toEqual({ path: "/journals#timeline", hops: 0 });
  });

  it("follows an exact redirect", () => {
    expect(redirectTarget({ "/journals#timeline": "/periods#timeline" }, "/journals#timeline")).toEqual({
      path: "/periods#timeline",
      hops: 1,
    });
  });

  it("follows a chain", () => {
    const redirects = { "/a#x": "/b#x", "/b#x": "/c#x" };
    expect(redirectTarget(redirects, "/a#x")).toEqual({ path: "/c#x", hops: 2 });
  });

  it("carries the fragment over a page redirect", () => {
    expect(redirectTarget({ "/views-and-blocks": "/views" }, "/views-and-blocks#blocks")).toEqual({
      path: "/views#blocks",
      hops: 1,
    });
  });

  it("prefers a page redirect's own fragment over the one it was reached with", () => {
    expect(redirectTarget({ "/old": "/new#section" }, "/old#other")).toEqual({ path: "/new#section", hops: 1 });
  });

  it("prefers an exact redirect over its page's redirect", () => {
    const redirects = { "/old": "/new", "/old#kept": "/elsewhere#kept" };
    expect(redirectTarget(redirects, "/old#kept")).toEqual({ path: "/elsewhere#kept", hops: 1 });
  });

  it("reports a loop", () => {
    expect(redirectTarget({ "/a": "/b", "/b": "/a" }, "/a")).toEqual({ error: "loop", path: "/a" });
  });

  it("reports a chain longer than the hop limit", () => {
    const redirects = { "/1": "/2", "/2": "/3", "/3": "/4" };
    expect(redirectTarget(redirects, "/1", 2)).toEqual({ error: "too-many-hops", path: "/3" });
  });
});
