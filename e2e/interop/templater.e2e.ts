import { browser, expect } from "@wdio/globals";

import { runCommand } from "../support/commands.js";
import { cursorOf, editorValue, waitForCursorLine } from "../support/editor.js";
import { contentOf, waitForActiveNoteIn, waitForContent } from "../support/vault.js";

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

  it("renders the plugin engine first, then Templater, in one template", async () => {
    await runCommand("journals:open-compose");

    const path = await waitForActiveNoteIn("compose");
    await waitForContent(
      path,
      (content) => content.includes("compose / templater-ran"),
      "waited for the compose note to render {{ }} then <% %>",
    );

    const content = await contentOf(path);
    expect(content).not.toContain("<%");
    expect(content).not.toContain("{{");
  });

  it("jumps the editor cursor to the Templater cursor marker", async () => {
    await runCommand("journals:open-cursor");

    await waitForActiveNoteIn("cursor");
    // Frontmatter occupies lines 0-3 and "intro" is line 4, so the marker sat on
    // line 5; the jump removes it and lands the cursor at the start of "tail". The
    // fixture enables Templater's auto_jump_to_cursor, which gates the jump our
    // bridge requests — matching v2 and Templater's own create-from-template flow.
    await waitForCursorLine(5, "waited for the editor cursor to jump to the Templater marker");

    const cursor = await cursorOf();
    expect(cursor).toEqual({ line: 5, ch: 0 });

    const value = await editorValue();
    expect(value).not.toContain("tp.file.cursor");
    expect(value).not.toContain("<%");
  });
});
