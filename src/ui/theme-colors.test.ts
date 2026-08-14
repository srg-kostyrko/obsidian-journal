import { describe, expect, it } from "vitest";

import { themeColorGroupsFor, type ThemeColorFieldRole } from "./theme-colors";

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

    it("returns a single group", () => {
      expect(themeColorGroupsFor("text")).toHaveLength(1);
    });
  });

  describe("background fields", () => {
    it("offers a background variable", () => {
      expect(namesFor("background")).toContain("background-primary");
    });

    it("omits a text variable", () => {
      expect(namesFor("background")).not.toContain("text-faint");
    });

    it("returns a single group", () => {
      expect(themeColorGroupsFor("background")).toHaveLength(1);
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

    it("lists the border group before the text group", () => {
      expect(themeColorGroupsFor("border").map((group) => group.tag)).toEqual(["border", "text"]);
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

    it("lists the text group before the background group", () => {
      expect(themeColorGroupsFor("fill").map((group) => group.tag)).toEqual(["text", "background"]);
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
