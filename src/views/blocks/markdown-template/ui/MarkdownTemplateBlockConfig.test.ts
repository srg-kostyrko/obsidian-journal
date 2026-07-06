import userEvent from "@testing-library/user-event";
import { cleanup, render, screen } from "@testing-library/vue";
import { afterEach, describe, expect, it, vi } from "vitest";

import { Container, provideInjectorOnApp } from "@/infrastructure/di";
import { InputSuggestService, NotesService } from "@/infrastructure/host";
import { FakeInputSuggestService } from "@/infrastructure/host/input-suggests/testing";
import { ModalService } from "@/infrastructure/host/modals";
import { FakeModalService } from "@/infrastructure/host/modals/testing";
import { FakeNotesService } from "@/infrastructure/host/testing";

import MarkdownTemplateBlockConfig from "./MarkdownTemplateBlockConfig.vue";
import { markdownTemplateVariablesModal } from "./modals";

import type { MarkdownTemplateConfig } from "../markdown-template-block";

afterEach(() => cleanup());

function mountConfig(config: MarkdownTemplateConfig, onChange: (next: MarkdownTemplateConfig) => void) {
  const notes = new FakeNotesService();
  notes.seed("templates/daily.md" as never);
  const modals = new FakeModalService();
  const container = new Container();
  container.register(NotesService).useValue(notes as unknown as NotesService);
  container.register(InputSuggestService).useValue(new FakeInputSuggestService() as unknown as InputSuggestService);
  container.register(ModalService).useValue(modals as unknown as ModalService);
  render(MarkdownTemplateBlockConfig, {
    props: { config, onChange },
    global: { plugins: [{ install: (app) => provideInjectorOnApp(app, container) }] },
  });
  return { modals };
}

describe("MarkdownTemplateBlockConfig", () => {
  it("emits onChange with the new path when the file input changes", async () => {
    const onChange = vi.fn();
    mountConfig({ templatePath: "" }, onChange);
    const input = screen.getByRole("textbox");
    await userEvent.type(input, "templates/daily.md");
    expect(onChange).toHaveBeenLastCalledWith({ templatePath: "templates/daily.md" });
  });

  it("opens the variables reference modal when the supported-variables link is clicked", async () => {
    const { modals } = mountConfig({ templatePath: "" }, vi.fn());
    await userEvent.click(screen.getByRole("link"));
    expect(modals.lastOpen().definition).toBe(markdownTemplateVariablesModal);
  });
});
