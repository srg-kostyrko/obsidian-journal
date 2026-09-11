import { browser, expect } from "@wdio/globals";

import { runCommand } from "../support/commands.js";
import { cursorOf, editorValue, waitForCursorLine } from "../support/editor.js";
import { contentOf, todayAnchor, waitForActiveNoteIn, waitForContent } from "../support/vault.js";

// Slice D — the Templater interop seam. The `e2e-templater` fixture commits day
// journals whose templates carry Templater `<% %>` syntax; booting the real
// Templater plugin alongside ours and firing a journal command runs the real
// TemplateContentService -> TemplaterService.apply -> parse_template chain. Against
// the Obsidian fake, getPlugin("templater-obsidian") returns nothing, so the
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

  // Templater resolves `tp.file.include` by reading the sub-template off disk, past the engine
  // pass that rendered the parent, so before the parser hook the sub-template's `{{ }}` reached
  // the note verbatim (#190). Only the real plugin exercises that re-entry.
  it("renders plugin variables in a sub-template Templater includes", async () => {
    await runCommand("journals:open-include");

    const path = await waitForActiveNoteIn("include");
    await waitForContent(
      path,
      (content) => content.includes("sub include"),
      "waited for the included sub-template to render its variables",
    );

    const content = await contentOf(path);
    expect(content).toContain("parent include / sub include");
    // The sub-template's date sits inside a Templater command, so it proves the variables were
    // rendered before Templater parsed the include rather than after it ran.
    expect(content).toContain(todayAnchor());
    expect(content).not.toContain("{{");
    expect(content).not.toContain("<%");
  });

  it("jumps the editor cursor to the Templater cursor marker", async () => {
    await runCommand("journals:open-cursor");

    await waitForActiveNoteIn("cursor");
    // Frontmatter occupies lines 0-3 and "intro" is line 4, so the marker sat on
    // line 5; the jump removes it and lands the cursor at the start of "tail". The
    // fixture enables Templater's auto_jump_to_cursor, which gates the jump our
    // bridge requests — matching Templater's own create-from-template flow.
    await waitForCursorLine(5, "waited for the editor cursor to jump to the Templater marker");

    const cursor = await cursorOf();
    expect(cursor).toEqual({ line: 5, ch: 0 });

    const value = await editorValue();
    expect(value).not.toContain("tp.file.cursor");
    expect(value).not.toContain("<%");
  });
});
