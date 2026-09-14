import userEvent from "@testing-library/user-event";
import { render, screen } from "@testing-library/vue";
import { describe, expect, it, onTestFinished, vi } from "vitest";

import { m } from "@/i18n";

import { manual } from "./manual";
import UiCollapsibleBlock from "./UiCollapsibleBlock.vue";

describe("UiCollapsibleBlock", () => {
  it("does not render the default slot when expanded is false", () => {
    render(UiCollapsibleBlock, {
      props: { expanded: false },
      slots: { trigger: "Title", default: "<div data-testid='body'>B</div>" },
    });
    expect(screen.queryByTestId("body")).toBeNull();
  });

  it("renders the default slot when expanded is true", () => {
    render(UiCollapsibleBlock, {
      props: { expanded: true },
      slots: { trigger: "Title", default: "<div data-testid='body'>B</div>" },
    });
    expect(screen.getByTestId("body")).toBeTruthy();
  });

  it("emits update:expanded(true) when the trigger is clicked while collapsed", async () => {
    const { container, emitted } = render(UiCollapsibleBlock, {
      props: { expanded: false },
      slots: { trigger: "Title" },
    });
    await userEvent.click(container.querySelector(".collapsible-trigger")!);
    expect(emitted("update:expanded")).toEqual([[true]]);
  });

  it("emits update:expanded(false) when the trigger is clicked while expanded", async () => {
    const { container, emitted } = render(UiCollapsibleBlock, {
      props: { expanded: true },
      slots: { trigger: "Title" },
    });
    await userEvent.click(container.querySelector(".collapsible-trigger")!);
    expect(emitted("update:expanded")).toEqual([[false]]);
  });

  it("does not emit update:expanded when clicking inside #controls", async () => {
    const { emitted } = render(UiCollapsibleBlock, {
      props: { expanded: false },
      slots: {
        trigger: "Title",
        controls: "<button data-testid='ctrl'>Ctrl</button>",
      },
    });
    await userEvent.click(screen.getByTestId("ctrl"));
    expect(emitted("update:expanded")).toBeUndefined();
  });

  describe("help", () => {
    it("opens the manual at the section without toggling the block", async () => {
      const open = vi.spyOn(window, "open").mockReturnValue(null);
      onTestFinished(() => open.mockRestore());
      const { emitted } = render(UiCollapsibleBlock, {
        props: { expanded: false, help: manual.journal.templates },
        slots: { trigger: "Title" },
      });

      await userEvent.click(screen.getByRole("link", { name: m.ui_manual_link() }));

      expect(open).toHaveBeenCalledWith("https://srg-kostyrko.github.io/obsidian-journal/journals#templates", "_blank");
      expect(emitted("update:expanded")).toBeUndefined();
    });

    it("renders no link without help", () => {
      render(UiCollapsibleBlock, { props: { expanded: false }, slots: { trigger: "Title" } });

      expect(screen.queryByRole("link")).toBeNull();
    });
  });
});
