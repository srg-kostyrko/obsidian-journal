import { render, screen } from "@testing-library/vue";
import { describe, expect, it } from "vitest";

import { m } from "@/i18n";

import { manual } from "./manual";
import UiSettingRow from "./UiSettingRow.vue";

describe("UiSettingRow", () => {
  describe("name", () => {
    it("renders the name prop in .setting-item-name", () => {
      const { container } = render(UiSettingRow, { props: { name: "Title" } });
      expect(container.querySelector(".setting-item-name")?.textContent?.trim()).toBe("Title");
    });

    it("renders the #name slot in place of the prop", () => {
      const { container } = render(UiSettingRow, {
        props: { name: "Prop" },
        slots: { name: "Slotted" },
      });
      expect(container.querySelector(".setting-item-name")?.textContent?.trim()).toBe("Slotted");
    });

    it("links the name to the manual when help is set", () => {
      render(UiSettingRow, { props: { name: "Title", help: manual.shelf.page } });

      expect(screen.getByRole("link", { name: m.ui_manual_link() }).getAttribute("href")).toBe(
        "https://srg-kostyrko.github.io/obsidian-journal/shelves",
      );
    });
  });

  it("renders the #description slot in .setting-item-description", () => {
    const { container } = render(UiSettingRow, {
      slots: { description: "<em>Note</em>" },
    });
    const desc = container.querySelector(".setting-item-description");
    expect(desc?.querySelector("em")?.textContent).toBe("Note");
  });

  it("hides the info block when controlsOnly is true", () => {
    const { container } = render(UiSettingRow, {
      props: { controlsOnly: true, name: "Title" },
      slots: { default: "<button>Go</button>" },
    });
    expect(container.querySelector(".setting-item-info")).toBeNull();
    expect(container.querySelector(".setting-item-control button")).not.toBeNull();
  });

  it("hides the control area when noControls is true", () => {
    const { container } = render(UiSettingRow, {
      props: { noControls: true, name: "Title" },
      slots: { default: "<button>Hidden</button>" },
    });
    expect(container.querySelector(".setting-item-control")).toBeNull();
    expect(container.querySelector(".setting-item-info")).not.toBeNull();
  });
});
