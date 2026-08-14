import { cleanup, render, screen } from "@testing-library/vue";
import { afterEach, describe, expect, it } from "vitest";

import { Container, provideInjectorOnApp } from "@/infrastructure/di";
import { MarkdownRenderService } from "@/infrastructure/host";
import { FakeMarkdownRenderService } from "@/infrastructure/host/testing";

import UiMarkdown from "./UiMarkdown.vue";

afterEach(() => cleanup());

function mount(props: { markdown: string; sourcePath: string }) {
  const container = new Container();
  container
    .register(MarkdownRenderService)
    .useValue(new FakeMarkdownRenderService() as unknown as MarkdownRenderService);
  return render(UiMarkdown, {
    props,
    global: { plugins: [{ install: (app) => provideInjectorOnApp(app, container) }] },
  });
}

describe("UiMarkdown", () => {
  it("renders the markdown through the render service", () => {
    mount({ markdown: "Hello world", sourcePath: "note.md" });
    expect(screen.getByText("Hello world")).toBeTruthy();
  });

  it("re-renders when the markdown prop changes", async () => {
    const { rerender } = mount({ markdown: "First", sourcePath: "note.md" });
    await rerender({ markdown: "Second", sourcePath: "note.md" });
    expect(screen.getByText("Second")).toBeTruthy();
    expect(screen.queryByText("First")).toBeNull();
  });
});
