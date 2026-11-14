import { $, browser } from "@wdio/globals";

import { m } from "../../src/i18n/paraglide/messages.js";

import { clickSectionButton, openSettings } from "./settings.js";
import { waitForState } from "./wait.js";

export async function openEditor(): Promise<void> {
  await openSettings();
  await clickSectionButton(m.calendar_appearance_section_title(), m.calendar_appearance_open());
  await $(".appearance-preview").waitForDisplayed({ timeoutMsg: "the appearance subpage showed no preview" });
}

export const partsList = () =>
  $(`//select[@id=//label[normalize-space(.)="${m.calendar_appearance_part_label()}"]/@for]`);

export async function chooseFromList(part: string): Promise<void> {
  await partsList().selectByAttribute("value", part);
  await waitForState(
    () => partsList().getValue(),
    (value) => value === part,
    `${part} did not become the edited part`,
  );
}

// A control's row, by its visible label; a "Narrow only" tag or an "All widths" note may follow it.
export const controlRowPath = (label: string): string =>
  `//div[contains(@class,"appearance-control")][.//div[contains(@class,"setting-item-name")][starts-with(normalize-space(.), "${label}")]]`;

export async function chooseColorKind(label: string, kind: "custom" | "unchanged"): Promise<void> {
  await $(controlRowPath(label)).$(".ui-color-settings-picker > select").selectByAttribute("value", kind);
}

// Writes a control's native input the way Vue's v-model listens for it: input[type="color"] would
// pop an OS dialog, and a range input takes no typed value.
export async function setNativeInput(label: string, selector: string, value: string): Promise<void> {
  await $(controlRowPath(label))
    .$(selector)
    .waitForExist({ timeoutMsg: `${label} showed no ${selector}` });
  await browser.execute(
    (rowPath: string, inputSelector: string, next: string) => {
      const row = document.evaluate(rowPath, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null)
        .singleNodeValue as Element | null;
      const input = row?.querySelector<HTMLInputElement>(inputSelector);
      if (!input) return;
      input.value = next;
      input.dispatchEvent(new Event("input", { bubbles: true }));
    },
    controlRowPath(label),
    selector,
    value,
  );
}

export async function setCustomColor(label: string, hex: string): Promise<void> {
  await chooseColorKind(label, "custom");
  await setNativeInput(label, 'input[type="color"]', hex);
}

export async function setSlider(label: string, value: number): Promise<void> {
  await setNativeInput(label, 'input[type="range"]', String(value));
}
