import { browser, expect } from "@wdio/globals";

import { m } from "../../src/i18n/paraglide/messages.js";
import { manual, manualUrl, type ManualPath } from "../../src/ui/manual.js";
import {
  clickButton,
  clickIcon,
  closeSettings,
  expandSection,
  openJournalSubpage,
  openNoteletTypeSubpage,
  openSettings,
  openShelfSubpage,
  waitForManualLinks,
} from "../support/settings.js";

// Unit tests mount the sections they name; only the real plugin assembles the settings tree from
// every registered module. This walks each settings page and pins which sections link, and where.

const DASHBOARD: ManualPath[] = [
  manual.shelf.creating,
  manual.journal.creating,
  manual.commands.yourOwn,
  manual.view.settings,
  manual.startup.openOnStartup,
  manual.view.notesByDate,
  manual.period.weeks,
  manual.decorations.owners,
  manual.tasks.page,
  manual.view.calendars,
  manual.troubleshooting.reportingBug,
  manual.troubleshooting.maintenance,
];

async function expectLinks(paths: readonly ManualPath[]): Promise<void> {
  const expected = paths.map(manualUrl);
  expect(await waitForManualLinks(expected)).toEqual(expected);
}

describe("manual links in settings", () => {
  describe("in a vault with shelves and a custom-interval journal", () => {
    before(async () => {
      await browser.reloadObsidian({ vault: "./e2e-tests/fixtures/e2e-journeys", plugins: ["journals"] });
    });
    beforeEach(openSettings);
    afterEach(closeSettings);

    it("links every section of the main settings page", async () => {
      await expectLinks(DASHBOARD);
    });

    it("links every section of a custom-interval journal's page", async () => {
      await openJournalSubpage("spill-me", "sprint");

      await expectLinks([
        manual.journal.page,
        manual.shelf.placing,
        manual.journal.noteCreation,
        manual.questions.page,
        manual.journal.templates,
        manual.notelet.addingType,
        manual.journal.timeline,
        manual.journal.sequentialNumbers,
        manual.journal.frontmatter,
        manual.commands.yourOwn,
        manual.navigation.page,
        manual.navigation.intervalLines,
        manual.decorations.owners,
        manual.tasks.journalRule,
      ]);
    });

    it("links every section of a shelf's page", async () => {
      await openShelfSubpage("core");

      await expectLinks([manual.shelf.page, manual.shelf.creating, manual.shelf.commands, manual.decorations.owners]);
    });

    it("links every section of a view's page", async () => {
      await expandSection(m.view_dashboard_section_title());
      await clickIcon(m.view_dashboard_open({ name: "Calendar" }));

      await expectLinks([manual.view.settings, manual.view.blocks]);
    });

    it("links every section of the maintenance page", async () => {
      await clickButton(m.maintenance_open());

      await expectLinks([manual.troubleshooting.snapshots, manual.guides.importing, manual.troubleshooting.vaultCheck]);
    });
  });

  describe("in a vault with notelet types", () => {
    before(async () => {
      await browser.reloadObsidian({ vault: "./e2e-tests/fixtures/e2e-notelets", plugins: ["journals"] });
    });
    beforeEach(openSettings);
    afterEach(closeSettings);

    it("links every section of a notelet type's page", async () => {
      await openNoteletTypeSubpage("daily");

      await expectLinks([
        manual.notelet.page,
        manual.notelet.addingType,
        manual.journal.templates,
        manual.questions.page,
        manual.commands.yourOwn,
      ]);
    });
  });

  describe("in a vault where two journals collide", () => {
    before(async () => {
      await browser.reloadObsidian({ vault: "./e2e-tests/fixtures/e2e-colliding", plugins: ["journals"] });
    });
    beforeEach(openSettings);
    afterEach(closeSettings);

    it("links the collision warning ahead of the other sections", async () => {
      await expectLinks([manual.troubleshooting.collidingJournals, ...DASHBOARD]);
    });
  });
});
