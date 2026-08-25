import { screen } from "@testing-library/vue";
import { describe, expect, it } from "vitest";
import { defineComponent, h, ref } from "vue";

import type { AnchorString } from "@/calendar/types";
import { m } from "@/i18n";
import { MarkdownRenderService, NotesService, type VaultPath } from "@/infrastructure/host";
import { FakeMarkdownRenderService } from "@/infrastructure/host/testing";
import { overrideWith, testContainer } from "@/testing";

import { provideViewContextStub } from "../../../testing";
import { provideViewContext } from "../../../view-context";
import { markdownTemplateBlock, type MarkdownTemplateConfig } from "../markdown-template-block";

import type { BlockInstanceId } from "../../../config";

async function seedAndMount(files: Record<string, string>, config: MarkdownTemplateConfig, refDate: AnchorString) {
  const harness = await testContainer({
    overrides: [
      overrideWith(MarkdownRenderService, new FakeMarkdownRenderService() as unknown as MarkdownRenderService),
    ],
  });
  for (const [path, content] of Object.entries(files)) harness.host.putFile(path, content);

  const refDateRef = ref(refDate);
  const configRef = ref(config);
  const context = provideViewContextStub({ refDate: refDateRef });
  const renderRoot = () =>
    h(markdownTemplateBlock.component, { instanceId: "block-1" as BlockInstanceId, config: configRef.value });
  const Wrapper = defineComponent({
    setup() {
      provideViewContext(context);
      return renderRoot;
    },
  });
  const result = harness.render(Wrapper);
  return { ...result, harness, refDateRef, configRef };
}

describe("MarkdownTemplateBlock", () => {
  it("resolves {{date}} to the view's date", async () => {
    await seedAndMount(
      { "templates/today.md": "Today is {{date}}" },
      { templatePath: "templates/today.md" },
      "2026-05-15" as AnchorString,
    );
    expect(await screen.findByText("Today is 2026-05-15")).toBeTruthy();
  });

  it("shows the placeholder when no template path is configured", async () => {
    await seedAndMount({}, { templatePath: "" }, "2026-05-15" as AnchorString);
    expect(screen.getByText(m.view_block_markdown_template_empty())).toBeTruthy();
  });

  it("shows an inline error when the template file cannot be read", async () => {
    await seedAndMount({}, { templatePath: "templates/missing.md" }, "2026-05-15" as AnchorString);
    expect(await screen.findByText(m.view_block_markdown_template_read_error())).toBeTruthy();
  });

  it("re-renders when the focused date changes", async () => {
    const { refDateRef } = await seedAndMount(
      { "templates/today.md": "Today is {{date}}" },
      { templatePath: "templates/today.md" },
      "2026-05-15" as AnchorString,
    );
    refDateRef.value = "2026-06-20" as AnchorString;
    expect(await screen.findByText("Today is 2026-06-20")).toBeTruthy();
  });

  it("re-reads the file when it is edited in the vault", async () => {
    const { harness } = await seedAndMount(
      { "templates/today.md": "A {{date}}" },
      { templatePath: "templates/today.md" },
      "2026-05-15" as AnchorString,
    );
    expect(await screen.findByText("A 2026-05-15")).toBeTruthy();
    harness.host.putFile("templates/today.md", "B {{date}}");
    harness.host.emitMetadata("templates/today.md");
    expect(await screen.findByText("B 2026-05-15")).toBeTruthy();
  });

  it("reloads when the configured template path changes", async () => {
    const { configRef } = await seedAndMount(
      { "templates/a.md": "File A", "templates/b.md": "File B" },
      { templatePath: "templates/a.md" },
      "2026-05-15" as AnchorString,
    );
    expect(await screen.findByText("File A")).toBeTruthy();
    configRef.value = { templatePath: "templates/b.md" };
    expect(await screen.findByText("File B")).toBeTruthy();
  });

  it("shows an inline error when the template file is deleted from the vault", async () => {
    const { harness } = await seedAndMount(
      { "templates/today.md": "A {{date}}" },
      { templatePath: "templates/today.md" },
      "2026-05-15" as AnchorString,
    );
    expect(await screen.findByText("A 2026-05-15")).toBeTruthy();
    await harness.resolve(NotesService).delete("templates/today.md" as VaultPath);
    expect(await screen.findByText(m.view_block_markdown_template_read_error())).toBeTruthy();
  });
});
