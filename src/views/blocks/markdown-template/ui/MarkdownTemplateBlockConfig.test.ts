import userEvent from "@testing-library/user-event";
import { screen } from "@testing-library/vue";
import { describe, expect, it, vi } from "vitest";

import { testContainer } from "@/testing";

import MarkdownTemplateBlockConfig from "./MarkdownTemplateBlockConfig.vue";
import { markdownTemplateVariablesModal } from "./modals";

import type { MarkdownTemplateConfig } from "../markdown-template-block";

async function mountConfig(config: MarkdownTemplateConfig, onChange: (next: MarkdownTemplateConfig) => void) {
  const harness = await testContainer();
  harness.render(MarkdownTemplateBlockConfig, { props: { config, onChange } });
  return harness;
}

describe("MarkdownTemplateBlockConfig", () => {
  it("emits onChange with the new path when the file input changes", async () => {
    const onChange = vi.fn();
    await mountConfig({ templatePath: "" }, onChange);
    const input = screen.getByRole("textbox");
    await userEvent.type(input, "templates/daily.md");
    expect(onChange).toHaveBeenLastCalledWith({ templatePath: "templates/daily.md" });
  });

  it("opens the variables reference modal when the supported-variables link is clicked", async () => {
    const harness = await mountConfig({ templatePath: "" }, vi.fn());
    await userEvent.click(screen.getByRole("link"));
    expect(harness.modals.lastOpen().definition).toBe(markdownTemplateVariablesModal);
  });
});
