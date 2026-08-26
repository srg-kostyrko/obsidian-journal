import { screen } from "@testing-library/vue";
import { beforeEach, describe, expect, it } from "vitest";

import { MarkdownRenderService } from "@/infrastructure/host";
import { FakeMarkdownRenderService } from "@/infrastructure/host/testing";
import { overrideWith, testContainer, type TestHarness } from "@/testing";

import UiMarkdown from "./UiMarkdown.vue";

describe("UiMarkdown", () => {
  let harness: TestHarness;

  beforeEach(async () => {
    harness = await testContainer({
      overrides: [
        overrideWith(MarkdownRenderService, new FakeMarkdownRenderService() as unknown as MarkdownRenderService),
      ],
    });
  });

  it("renders the markdown through the render service", () => {
    harness.render(UiMarkdown, { props: { markdown: "Hello world", sourcePath: "note.md" } });
    expect(screen.getByText("Hello world")).toBeTruthy();
  });

  it("re-renders when the markdown prop changes", async () => {
    const { rerender } = harness.render(UiMarkdown, { props: { markdown: "First", sourcePath: "note.md" } });
    await rerender({ markdown: "Second", sourcePath: "note.md" });
    expect(screen.getByText("Second")).toBeTruthy();
    expect(screen.queryByText("First")).toBeNull();
  });
});
