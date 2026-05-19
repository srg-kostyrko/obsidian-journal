import { cleanup, render } from "@testing-library/vue";
import { afterEach, describe, expect, it, vi } from "vitest";

import { Container, provideInjectorOnApp } from "@/infrastructure/di";
import { InputSuggestService, NotesService } from "@/infrastructure/host";
import { FakeInputSuggestService } from "@/infrastructure/host/input-suggests/testing";
import { FakeNotesService } from "@/infrastructure/host/testing";

import FolderInput from "./FolderInput.vue";

afterEach(() => cleanup());

function build() {
  const notes = new FakeNotesService();
  notes.seed("Daily/today.md" as never);
  notes.seed("Other/note.md" as never);
  const inputSuggest = new FakeInputSuggestService();
  const container = new Container();
  container.register(NotesService).useValue(notes as unknown as NotesService);
  container.register(InputSuggestService).useValue(inputSuggest as unknown as InputSuggestService);
  return { notes, inputSuggest, container };
}

describe("FolderInput", () => {
  it("offers folder candidates from NotesService.listFolders, filtered by query", () => {
    const { inputSuggest, container } = build();
    render(FolderInput, {
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
    expect(handle.query("").toSorted()).toEqual(["", "Daily", "Other"]);
    expect(handle.query("ai")).toEqual(["Daily"]);
  });
});
