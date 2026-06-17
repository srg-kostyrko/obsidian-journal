import { describe, expect, it } from "vitest";

import { m } from "@/i18n";

import { markdownTemplateBlock } from "./markdown-template-block";

describe("markdownTemplateBlock.summary", () => {
  it("shows the template path when set", () => {
    expect(markdownTemplateBlock.summary?.({ templatePath: "notes/t.md" })).toBe("notes/t.md");
  });
  it("shows the empty message when no template is chosen", () => {
    expect(markdownTemplateBlock.summary?.({ templatePath: "" })).toBe(m.view_block_markdown_template_empty());
  });
});
