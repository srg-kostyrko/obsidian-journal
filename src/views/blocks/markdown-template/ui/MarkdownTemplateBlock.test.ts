import { cleanup, render, screen } from "@testing-library/vue";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { defineComponent, h, ref } from "vue";

import { installTestCalendar } from "@/calendar/testing";
import type { AnchorString } from "@/calendar/types";
import { m } from "@/i18n";
import { Container, provideInjectorOnApp } from "@/infrastructure/di";
import { MarkdownRenderService, NotesService } from "@/infrastructure/host";
import { FakeMarkdownRenderService, FakeNotesService } from "@/infrastructure/host/testing";
import { TemplateEngine } from "@/templates";

import { provideViewContextStub } from "../../../testing";
import { provideViewContext } from "../../../view-context";
import { markdownTemplateBlock, type MarkdownTemplateConfig } from "../markdown-template-block";

import type { BlockInstanceId } from "../../../config";

beforeAll(() => {
  installTestCalendar();
});

afterEach(() => cleanup());

function seedAndMount(files: Record<string, string>, config: MarkdownTemplateConfig, refDate: AnchorString) {
  const notes = new FakeNotesService();
  for (const [path, content] of Object.entries(files)) notes.seed(path as never, content);

  const container = new Container();
  container.register(NotesService).useValue(notes as unknown as NotesService);
  // TemplateEngine resolves FunctionHandlerToken (a multi-token); with none
  // registered it resolves to an empty handler set — journal_link is not needed here.
  container.register(TemplateEngine).useClass(TemplateEngine);
  container
    .register(MarkdownRenderService)
    .useValue(new FakeMarkdownRenderService() as unknown as MarkdownRenderService);

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
  const result = render(Wrapper, {
    global: {
      plugins: [
        {
          install(app) {
            provideInjectorOnApp(app, container);
          },
        },
      ],
    },
  });
  return { ...result, notes, refDateRef, configRef };
}

describe("MarkdownTemplateBlock", () => {
  it("renders the template with {{date}} resolved to the focused refDate", async () => {
    seedAndMount(
      { "templates/today.md": "Today is {{date}}" },
      { templatePath: "templates/today.md" },
      "2026-05-15" as AnchorString,
    );
    expect(await screen.findByText("Today is 2026-05-15")).toBeTruthy();
  });

  it("shows the placeholder when no template path is configured", () => {
    seedAndMount({}, { templatePath: "" }, "2026-05-15" as AnchorString);
    expect(screen.getByText(m.view_block_markdown_template_empty())).toBeTruthy();
  });

  it("shows an inline error when the template file cannot be read", async () => {
    seedAndMount({}, { templatePath: "templates/missing.md" }, "2026-05-15" as AnchorString);
    expect(await screen.findByText(m.view_block_markdown_template_read_error())).toBeTruthy();
  });

  it("re-renders when the focused date changes", async () => {
    const { refDateRef } = seedAndMount(
      { "templates/today.md": "Today is {{date}}" },
      { templatePath: "templates/today.md" },
      "2026-05-15" as AnchorString,
    );
    refDateRef.value = "2026-06-20" as AnchorString;
    expect(await screen.findByText("Today is 2026-06-20")).toBeTruthy();
  });

  it("re-reads the file when it is edited in the vault", async () => {
    const { notes } = seedAndMount(
      { "templates/today.md": "A {{date}}" },
      { templatePath: "templates/today.md" },
      "2026-05-15" as AnchorString,
    );
    expect(await screen.findByText("A 2026-05-15")).toBeTruthy();
    notes.externalEdit("templates/today.md" as never, "B {{date}}");
    expect(await screen.findByText("B 2026-05-15")).toBeTruthy();
  });

  it("reloads when the configured template path changes", async () => {
    const { configRef } = seedAndMount(
      { "templates/a.md": "File A", "templates/b.md": "File B" },
      { templatePath: "templates/a.md" },
      "2026-05-15" as AnchorString,
    );
    expect(await screen.findByText("File A")).toBeTruthy();
    configRef.value = { templatePath: "templates/b.md" };
    expect(await screen.findByText("File B")).toBeTruthy();
  });

  it("shows an inline error when the template file is deleted from the vault", async () => {
    const { notes } = seedAndMount(
      { "templates/today.md": "A {{date}}" },
      { templatePath: "templates/today.md" },
      "2026-05-15" as AnchorString,
    );
    expect(await screen.findByText("A 2026-05-15")).toBeTruthy();
    await notes.delete("templates/today.md" as never);
    expect(await screen.findByText(m.view_block_markdown_template_read_error())).toBeTruthy();
  });
});
