import { cleanup, render } from "@testing-library/vue";
import { afterEach, describe, expect, it, vi } from "vitest";

import { Container, provideInjectorOnApp } from "@/infrastructure/di";
import { InputSuggestService, NotesService } from "@/infrastructure/host";
import { FakeInputSuggestService } from "@/infrastructure/host/input-suggests/testing";
import { FakeNotesService } from "@/infrastructure/host/testing";

import FileInput from "./FileInput.vue";

afterEach(() => cleanup());

function build() {
  const notes = new FakeNotesService();
  notes.seed("templates/daily.md" as never);
  notes.seed("templates/weekly.md" as never);
  const inputSuggest = new FakeInputSuggestService();
  const container = new Container();
  container.register(NotesService).useValue(notes as unknown as NotesService);
  container.register(InputSuggestService).useValue(inputSuggest as unknown as InputSuggestService);
  return { inputSuggest, container };
}

describe("FileInput", () => {
  it("offers markdown notes from NotesService.allMarkdownNotes, filtered by query", () => {
    const { inputSuggest, container } = build();
    render(FileInput, {
      props: { modelValue: "", "onUpdate:modelValue": vi.fn() },
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
    const handle = inputSuggest.attachments[0];
    expect(handle.query("").toSorted()).toEqual(["templates/daily.md", "templates/weekly.md"]);
    expect(handle.query("weekly")).toEqual(["templates/weekly.md"]);
  });
});
