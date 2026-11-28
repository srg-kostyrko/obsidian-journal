import { describe, expect, it } from "vitest";

import { themeColorGroupsFor, themeColorLabel, type ThemeColorFieldRole } from "./theme-colors";

function namesFor(role: ThemeColorFieldRole): string[] {
  return themeColorGroupsFor(role).flatMap((group) => group.names);
}

describe("themeColorGroupsFor", () => {
  describe("text fields", () => {
    it("offers a text variable", () => {
      expect(namesFor("text")).toContain("text-normal");
    });

    it("omits a background variable", () => {
      expect(namesFor("text")).not.toContain("background-primary");
    });

    it("omits a border variable", () => {
      expect(namesFor("text")).not.toContain("background-modifier-border");
    });

    it("lists the text group before the palette group", () => {
      expect(themeColorGroupsFor("text").map((group) => group.tag)).toEqual(["text", "palette"]);
    });
  });

  describe("background fields", () => {
    it("offers a background variable", () => {
      expect(namesFor("background")).toContain("background-primary");
    });

    it("omits a text variable", () => {
      expect(namesFor("background")).not.toContain("text-faint");
    });

    it("lists the background group before the palette group", () => {
      expect(themeColorGroupsFor("background").map((group) => group.tag)).toEqual(["background", "palette"]);
    });
  });

  describe("border fields", () => {
    it("offers a border variable", () => {
      expect(namesFor("border")).toContain("background-modifier-border-focus");
    });

    it("offers a text variable", () => {
      expect(namesFor("border")).toContain("text-accent");
    });

    it("omits a background variable", () => {
      expect(namesFor("border")).not.toContain("background-primary");
    });

    it("lists the border group, then the text group, then the palette group", () => {
      expect(themeColorGroupsFor("border").map((group) => group.tag)).toEqual(["border", "text", "palette"]);
    });
  });

  describe("fill fields", () => {
    it("offers a text variable", () => {
      expect(namesFor("fill")).toContain("text-accent");
    });

    it("offers a background variable", () => {
      expect(namesFor("fill")).toContain("background-secondary");
    });

    it("omits a border variable", () => {
      expect(namesFor("fill")).not.toContain("background-modifier-border");
    });

    it("lists the text group, then the background group, then the palette group", () => {
      expect(themeColorGroupsFor("fill").map((group) => group.tag)).toEqual(["text", "background", "palette"]);
    });
  });

  describe("variables whose name prefix contradicts their role", () => {
    it("offers the selection fill to a background field", () => {
      expect(namesFor("background")).toContain("text-selection");
    });

    it("offers the highlight fill to a background field", () => {
      expect(namesFor("background")).toContain("text-highlight-bg");
    });

    it("withholds the selection fill from a text field", () => {
      expect(namesFor("text")).not.toContain("text-selection");
    });

    it("withholds the border stroke from a background field", () => {
      expect(namesFor("background")).not.toContain("background-modifier-border-hover");
    });
  });

  describe("theme palette", () => {
    it.each<ThemeColorFieldRole>(["text", "background", "border", "fill"])(
      "offers the palette to a %s field",
      (role) => {
        expect(themeColorGroupsFor(role).at(-1)?.names).toEqual([
          "color-red",
          "color-orange",
          "color-yellow",
          "color-green",
          "color-cyan",
          "color-blue",
          "color-purple",
          "color-pink",
        ]);
      },
    );

    it("labels a palette color by its hue", () => {
      expect(themeColorLabel("color-red")).toBe("Red");
    });
  });

  describe("variables that are not colors", () => {
    it("offers the error RGB triple to no field", () => {
      const roles: ThemeColorFieldRole[] = ["text", "background", "border", "fill"];
      expect(roles.flatMap(namesFor)).not.toContain("background-modifier-error-rgb");
    });

    it("offers the success RGB triple to no field", () => {
      const roles: ThemeColorFieldRole[] = ["text", "background", "border", "fill"];
      expect(roles.flatMap(namesFor)).not.toContain("background-modifier-success-rgb");
    });
  });
});
