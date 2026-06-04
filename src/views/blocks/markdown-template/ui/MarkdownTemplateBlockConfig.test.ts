import userEvent from "@testing-library/user-event";
import { cleanup, render, screen } from "@testing-library/vue";
import { afterEach, describe, expect, it, vi } from "vitest";

import { Container, provideInjectorOnApp } from "@/infrastructure/di";
import { InputSuggestService, NotesService } from "@/infrastructure/host";
import { FakeInputSuggestService } from "@/infrastructure/host/input-suggests/testing";
import { FakeNotesService } from "@/infrastructure/host/testing";

import MarkdownTemplateBlockConfig from "./MarkdownTemplateBlockConfig.vue";

import type { MarkdownTemplateConfig } from "../markdown-template-block";

afterEach(() => cleanup());

function mountConfig(config: MarkdownTemplateConfig, onChange: (next: MarkdownTemplateConfig) => void) {
  const notes = new FakeNotesService();
  notes.seed("templates/daily.md" as never);
  const container = new Container();
  container.register(NotesService).useValue(notes as unknown as NotesService);
  container.register(InputSuggestService).useValue(new FakeInputSuggestService() as unknown as InputSuggestService);
  return render(MarkdownTemplateBlockConfig, {
    props: { config, onChange },
    global: { plugins: [{ install: (app) => provideInjectorOnApp(app, container) }] },
  });
}

describe("MarkdownTemplateBlockConfig", () => {
  it("emits onChange with the new path when the file input changes", async () => {
    const onChange = vi.fn();
    mountConfig({ templatePath: "" }, onChange);
    const input = screen.getByRole("textbox");
    await userEvent.type(input, "templates/daily.md");
    expect(onChange).toHaveBeenLastCalledWith({ templatePath: "templates/daily.md" });
  });
});
