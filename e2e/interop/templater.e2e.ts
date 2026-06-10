import { browser, expect } from "@wdio/globals";

import { contentOf, runCommand, waitForActiveNoteIn, waitForContent } from "../support/templater.js";

// Slice D — the Templater interop seam. The `e2e-templater` fixture commits day
// journals whose templates carry Templater `<% %>` syntax; booting the real
// Templater plugin alongside ours and firing a journal command runs the real
// TemplateContentService -> TemplaterService.apply -> parse_template chain. Against
// __mocks__/obsidian.ts, getPlugin("templater-obsidian") returns nothing, so the
// `<% %>` would survive untouched — none of this is reachable there.
describe("templater interop", () => {
  before(async () => {
    await browser.reloadObsidian({
      vault: "./e2e/fixtures/e2e-templater",
      plugins: ["journals", "templater-obsidian"],
    });
  });

  it("evaluates Templater syntax in a created journal note", async () => {
    await runCommand("journals:open-eval");

    const path = await waitForActiveNoteIn("eval");
    // The literal template `<% "templater-ran" %>` already contains the marker
    // substring, so waiting on the marker alone would match the unevaluated note.
    // Evaluation is proven only once the `<%` delimiters are gone.
    await waitForContent(
      path,
      (content) => content.includes("templater-ran") && !content.includes("<%"),
      "waited for the eval note to evaluate its Templater template",
    );

    const content = await contentOf(path);
    expect(content).toContain("templater-ran");
    expect(content).not.toContain("<%");
  });
});
