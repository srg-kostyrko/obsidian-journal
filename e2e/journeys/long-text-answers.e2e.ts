import { browser, expect } from "@wdio/globals";

import { m } from "../../src/i18n/paraglide/messages.js";
import {
  clickDialogButton,
  modalTextAreaValue,
  setModalRowText,
  typeModalTextArea,
  waitForDialogClosed,
  waitForModalOpen,
} from "../support/settings.js";
import { openViaUri } from "../support/uri.js";
import { contentOf, seedNote, waitForFrontmatter, waitForJournalFrontmatter } from "../support/vault.js";

// Obsidian binds Cmd on macOS and Ctrl elsewhere; the dialog follows it.
const SUBMIT_MODIFIER = process.platform === "darwin" ? "Meta" : "Control";
const OTHER_MODIFIER = process.platform === "darwin" ? "Control" : "Meta";

const ANSWER = ["Call Anna", "about the lease", "", "Book the dentist"];
const TYPED = ANSWER.join("\n");

const TEMPLATE_LINES = [
  "---",
  "summary: {{challenge}}",
  "title: Day {{word}}",
  "---",
  "> [!question] Biggest challenge",
  "> {{challenge}}",
  "",
  "- [ ] {{challenge}}",
  "",
  "{{challenge}}",
  "",
];

const BODY_LINES = [
  "> [!question] Biggest challenge",
  "> Call Anna",
  "> about the lease",
  ">",
  "> Book the dentist",
  "",
  "- [ ] Call Anna",
  "      about the lease",
  "- [ ] Book the dentist",
  "",
  "Call Anna",
  "about the lease",
  "",
  "Book the dentist",
  "",
];

// Everything after the frontmatter block, which processFrontMatter re-serializes after the
// template is written — the body is the part whose bytes are ours.
function bodyOf(content: string): string {
  const match = /^---\r?\n[\s\S]*?\r?\n---\r?\n/.exec(content);
  return match === null ? content : content.slice(match[0].length);
}

async function writeTemplate(path: string, content: string): Promise<void> {
  await seedNote(path, content);
  const written = await browser.executeObsidian(({ app }, notePath) => app.vault.adapter.read(notePath), path);
  // The line-ending cases mean nothing if the vault normalized the template on write.
  expect(written).toBe(content);
}

for (const eol of ["\n", "\r\n"] as const) {
  const label = eol === "\n" ? "LF" : "CRLF";
  const date = eol === "\n" ? "2030-07-19" : "2030-07-20";

  describe(`a long text answer in a ${label} template`, () => {
    before(async () => {
      await browser.reloadObsidian({ vault: "./e2e/fixtures/e2e-long-text", plugins: ["journals"] });
      await writeTemplate("Templates/reflect.md", TEMPLATE_LINES.join(eol));
    });

    it("keeps its structure in the body, stays valid in the frontmatter and attaches the note", async () => {
      await openViaUri({ journal: "reflect", date });
      await waitForModalOpen();

      await setModalRowText("One word for today", "rough: day");
      await typeModalTextArea(ANSWER);
      await browser.keys([SUBMIT_MODIFIER, "Enter"]);
      await waitForDialogClosed();

      const path = `${date}.md`;
      await waitForJournalFrontmatter(path, { journal: "reflect", date });
      await waitForFrontmatter(
        path,
        (frontmatter) =>
          frontmatter.challenge === TYPED && frontmatter.summary === TYPED && frontmatter.title === "Day rough: day",
        "waited for the answers to read back from the note's properties",
      );
      expect(bodyOf((await contentOf(path)) ?? "")).toBe(BODY_LINES.join(eol));
    });
  });
}

describe("the long text box", () => {
  before(async () => {
    await browser.reloadObsidian({ vault: "./e2e/fixtures/e2e-long-text", plugins: ["journals"] });
    await writeTemplate("Templates/reflect.md", "{{challenge}}\n");
  });

  it("adds a line on Enter, ignores the other platform's modifier, and needs an answer", async () => {
    await openViaUri({ journal: "reflect", date: "2030-07-21" });
    await waitForModalOpen();

    await typeModalTextArea(["one", "two"]);
    expect(await modalTextAreaValue()).toBe("one\ntwo");

    await browser.keys([OTHER_MODIFIER, "Enter"]);
    await waitForModalOpen();
    expect(await modalTextAreaValue()).toBe("one\ntwo");

    await clickDialogButton(m.common_action_cancel());
    await waitForDialogClosed();
  });
});
