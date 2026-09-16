import { $, browser, expect } from "@wdio/globals";

import { closeSettings, openSettings } from "../support/settings.js";

// e2e-colliding defines two day journals (alpha, beta) sharing folder + dateFormat + the
// default {{date}} template, so their notes resolve to the same path. The dashboard's
// colliding-journals block warns about the clash, marking the warning in the theme error
// color (a rail on its leading edge plus an error-colored heading). The other three edges
// take the ordinary theme border, so the card reads as a notice rather than an outlined box.
const WARNING = ".journal-warning";

// Resolves --text-error to its computed rgb in this theme so color assertions stay
// theme-independent: an unstyled element's border/text default to currentColor, never the
// error color, so matching the resolved variable is what discriminates fix from regression.
// Reads the warning's leading-edge color and heading color and reports whether each equals
// the resolved error color (comparison done in-page; the runner only sees the verdict strings).
function colorVerdicts(): Promise<string> {
  return browser.execute(() => {
    const warning = document.querySelector(".journal-warning");
    const name = warning?.querySelector(".setting-item-heading .setting-item-name");
    const probe = document.createElement("div");
    probe.style.color = "var(--text-error)";
    document.body.append(probe);
    const error = getComputedStyle(probe).color;
    probe.remove();
    const rail = warning ? getComputedStyle(warning).borderInlineStartColor : "none";
    const heading = name ? getComputedStyle(name).color : "none";
    return [`rail:${rail === error}`, `heading:${heading === error}`].join(" ");
  });
}

describe("colliding journals warning", () => {
  before(async () => {
    await browser.reloadObsidian({ vault: "./e2e/fixtures/e2e-colliding", plugins: ["journals"] });
  });

  after(closeSettings);

  beforeEach(openSettings);

  it("names the clashing journals in the warning", async () => {
    await $(WARNING).waitForExist({ timeoutMsg: "colliding-journals warning did not render" });
    await expect($(WARNING)).toHaveText(expect.stringContaining("alpha and beta"));
  });

  it("frames the warning with a solid border", async () => {
    await $(WARNING).waitForExist();
    const style = await $(WARNING).getCSSProperty("border-top-style");
    expect(style.value).toBe("solid");
  });

  it("draws the leading edge in the theme error color", async () => {
    await $(WARNING).waitForExist();
    expect(await colorVerdicts()).toContain("rail:true");
  });

  it("colors the heading with the theme error color", async () => {
    await $(WARNING).waitForExist();
    expect(await colorVerdicts()).toContain("heading:true");
  });
});
