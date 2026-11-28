import { render, screen } from "@testing-library/vue";
import { describe, expect, it } from "vitest";

import CodeBlockSnippet from "./CodeBlockSnippet.vue";

describe("CodeBlockSnippet", () => {
  it("fences a name-only block", () => {
    render(CodeBlockSnippet, { props: { name: "journal-nav" } });
    expect(screen.getByRole("button").textContent).toBe("```journal-nav\n```");
  });

  it("puts the body inside the fence", () => {
    render(CodeBlockSnippet, { props: { name: "calendar-timeline", body: "mode: month" } });
    expect(screen.getByRole("button").textContent).toBe("```calendar-timeline\nmode: month\n```");
  });
});
