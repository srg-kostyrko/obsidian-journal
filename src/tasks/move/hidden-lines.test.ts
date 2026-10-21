import { describe, expect, it } from "vitest";

import { hiddenLines } from "./hidden-lines";

describe("hiddenLines", () => {
  it("a backslash-escaped backtick opens no inline code, so a comment opened after it hides the lines that follow", () => {
    expect([...hiddenLines(["Text \\` <!-- hidden `", "- [ ] a", "-->", "- [ ] b"])]).toEqual([1, 2]);
  });

  it("an escaped backslash leaves the backtick after it free to open inline code", () => {
    expect([...hiddenLines(["Text \\\\` <!-- shown `", "- [ ] a"])]).toEqual([]);
  });

  it("a backslash-escaped comment opener opens no comment, and a doubled backslash escapes nothing", () => {
    expect([...hiddenLines([String.raw`Text \<!-- shown`, "- [ ] a"])]).toEqual([]);
    expect([...hiddenLines([String.raw`Text \%% shown`, "- [ ] a"])]).toEqual([]);
    expect([...hiddenLines([String.raw`Text \\<!-- hidden`, "- [ ] a", "-->"])]).toEqual([1, 2]);
  });
});
