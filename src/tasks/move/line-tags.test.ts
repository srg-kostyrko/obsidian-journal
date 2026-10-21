import { describe, expect, it } from "vitest";

import { lineHasTag } from "./line-tags";

// Each row is what Obsidian's metadata worker (1.8.7, 1.12.7 and 1.14.4) lists for the line.
describe("lineHasTag", () => {
  it.each([
    ["- [ ] Task #rolled", true],
    ["- [ ] Task #ROLLED", true],
    ["- [ ] Task\t#rolled", true],
    ["- [ ] Task #rolled ^abc123", true],
    ["- [ ] Task #rolled^abc123", true],
    ["- [ ] Task #rolled.", true],
    ["- [ ] Task #rolled's", true],
    ["- [ ] Task **#rolled**", true],
    ["- [ ] Task a**#rolled**", true],
    ["- [ ] Task ==#rolled==", true],
    ["- [ ] Task ~~#rolled~~", true],
    ["- [ ] Task _#rolled_", true],
    ["- [ ] Task [#rolled]", true],
    ["- [ ] Task **[#rolled]**", true],
    ["- [ ] Task %%#rolled%%", true],
    ["- [ ] Task #work#rolled", true],
    ["- [ ] Task [[Note]]#rolled", true],
    ["- [ ] Task `code`#rolled", true],
    ["- [ ] Task [x](https://example.com)#rolled", true],
    ["- [ ] Task <b>#rolled</b>", true],
    ["- [ ] Task (#rolled)", false],
    ["- [ ] Task x#rolled", false],
    ['- [ ] Task "#rolled"', false],
    ["- [ ] Task **#rolled", false],
    ["- [ ] Task [#rolled", false],
    ["- [ ] Task ~#rolled~", false],
    ["- [ ] ]#rolled", false],
    ["- [ ] Task #123#rolled", false],
    [String.raw`- [ ] Task \#rolled`, false],
    ["- [ ] Task #rolled/sub", false],
    ["- [ ] Task #rolled2", false],
    ["- [ ] Task #rolled-x", false],
    ["- [ ] Task #rolled_x", false],
    ["- [ ] Task `x #rolled`", false],
    ["- [ ] Task $x #rolled$", false],
    ["- [ ] Task [[Note #rolled]]", false],
    ["- [ ] Task [[#rolled]]", false],
    ["- [ ] Task <!-- #rolled -->", false],
  ])("%j carries #rolled: %s", (line, expected) => {
    expect(lineHasTag(line, "#rolled")).toBe(expected);
  });

  it("an empty marker is never carried", () => {
    expect(lineHasTag("- [ ] Task # #rolled", "")).toBe(false);
  });
});
