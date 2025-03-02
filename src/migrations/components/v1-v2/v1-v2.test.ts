import { describe, expect, it } from "vitest";
import {
  FRONTMATTER_INTERVAL_INDEX_KEY,
  FRONTMATTER_SECTION_KEY,
  prepareCalendarJournalSettings,
  prepareIntervalJournalSettings,
  updateFrontmatterCalendarSection,
  updateFrontMatterInterval,
  type ConfiguredNames,
} from "./v1-v2";
import type { CalendarConfig, IntervalConfig } from "@/types/old-settings.types";
import { deepCopy } from "@/utils/misc";
import { NotesManagerMock } from "@/__mocks__/notes-manager.mock";
import { Journal } from "@/journals/journal";
import { AppManagerMock } from "@/__mocks__/app-manager.mock";
import { computed, ref } from "vue";
import { defaultJournalSettings } from "@/defaults";
import { JournalsIndex } from "@/journals/journals-index";
import {
  FRONTMATTER_DATE_KEY,
  FRONTMATTER_END_DATE_KEY,
  FRONTMATTER_INDEX_KEY,
  FRONTMATTER_NAME_KEY,
  FRONTMATTER_START_DATE_KEY,
} from "@/constants";
import { emptyNavRow } from "@/journals/journal-defaults";
import { JournalAnchorDate } from "@/types/journal.types";

describe("v1 to v2 migration", () => {
  describe("migrate calendar journal", () => {
    const oldSettings: CalendarConfig = {
      type: "calendar",
      id: "test-id",
      name: "Test name",
      rootFolder: "",
      openOnStartup: false,
      startupSection: "day",

      day: {
        enabled: true,
        openMode: "active",
        nameTemplate: "",
        dateFormat: "",
        folder: "",
        template: "",
        ribbon: {
          show: false,
          icon: "",
          tooltip: "",
        },
        createOnStartup: false,
      },
      week: {
        enabled: true,
        openMode: "active",
        nameTemplate: "",
        dateFormat: "",
        folder: "",
        template: "",
        ribbon: {
          show: false,
          icon: "",
          tooltip: "",
        },
        createOnStartup: false,
      },
      month: {
        enabled: true,
        openMode: "active",
        nameTemplate: "",
        dateFormat: "",
        folder: "",
        template: "",
        ribbon: {
          show: false,
          icon: "",
          tooltip: "",
        },
        createOnStartup: false,
      },
      quarter: {
        enabled: true,
        openMode: "active",
        nameTemplate: "",
        dateFormat: "",
        folder: "",
        template: "",
        ribbon: {
          show: false,
          icon: "",
          tooltip: "",
        },
        createOnStartup: false,
      },
      year: {
        enabled: true,
        openMode: "active",
        nameTemplate: "",
        dateFormat: "",
        folder: "",
        template: "",
        ribbon: {
          show: false,
          icon: "",
          tooltip: "",
        },
        createOnStartup: false,
      },
    };
    const names: ConfiguredNames = {
      shelf: "Test shelf",
      day: "Daily notes",
      week: "Weekly notes",
      month: "Monthly notes",
      quarter: "Quarterly notes",
      year: "Yearly notes",
    };

    describe("preparing settings", () => {
      it("migrates create on startups", () => {
        const oldSettingsCopy = deepCopy(oldSettings);
        oldSettingsCopy.day.createOnStartup = true;
        const settings = prepareCalendarJournalSettings(oldSettingsCopy, "day", names, false, false);

        expect(settings.autoCreate).toBe(true);
      });

      it("adds to shelf if shelves are enabled", () => {
        const settings = prepareCalendarJournalSettings(oldSettings, "day", names, true, false);

        expect(settings.shelves).toHaveLength(1);
        expect(settings.shelves[0]).toBe(names.shelf);
      });

      it("enables frontmatter fields if requested", () => {
        const settings = prepareCalendarJournalSettings(oldSettings, "day", names, false, true);

        expect(settings.frontmatter.addStartDate).toBeTruthy();
        expect(settings.frontmatter.addEndDate).toBeTruthy();
      });

      it("migrates folder", () => {
        const oldSettingsCopy = deepCopy(oldSettings);
        oldSettingsCopy.day.folder = "test-folder";
        const settings = prepareCalendarJournalSettings(oldSettingsCopy, "day", names, false, false);

        expect(settings.folder).toBe("test-folder");
      });

      it("adds root folder if configured", () => {
        const oldSettingsCopy = deepCopy(oldSettings);
        oldSettingsCopy.rootFolder = "root-folder";
        oldSettingsCopy.day.folder = "test-folder";
        const settings = prepareCalendarJournalSettings(oldSettingsCopy, "day", names, false, false);

        expect(settings.folder).toBe("root-folder/test-folder");
      });

      it("adds template to list if configured", () => {
        const oldSettingsCopy = deepCopy(oldSettings);
        oldSettingsCopy.day.template = "test-template.md";
        const settings = prepareCalendarJournalSettings(oldSettingsCopy, "day", names, false, false);

        expect(settings.templates).toContain("test-template.md");
      });

      it("knows how to convert custom ribbon", () => {
        const oldSettingsCopy = deepCopy(oldSettings);
        oldSettingsCopy.day.ribbon.show = true;
        oldSettingsCopy.day.ribbon.icon = "some-icon";
        oldSettingsCopy.day.ribbon.tooltip = "some tooltip";
        const settings = prepareCalendarJournalSettings(oldSettingsCopy, "day", names, false, false);
        expect(settings.commands).toHaveLength(1);
        expect(settings.commands[0]).toEqual({
          icon: "some-icon",
          name: "some tooltip",
          type: "same",
          context: "today",
          showInRibbon: true,
          openMode: "active",
        });
      });

      it("knows how to convert daily journal default settings", () => {
        const settings = prepareCalendarJournalSettings(oldSettings, "day", names, false, false);
        expect(settings.write).toEqual({
          type: "day",
        });
        expect(settings.name).toBe(names.day);
        expect(settings.nameTemplate).toBe("{{date}}");
        expect(settings.dateFormat).toBe("YYYY-MM-DD");
      });
      it("knows how to convert daily journal custom settings", () => {
        const oldSettingsCopy = deepCopy(oldSettings);
        oldSettingsCopy.day.nameTemplate = "{{journal_name}} {{date}}";
        oldSettingsCopy.day.dateFormat = "YYYY--MM--DD";
        const settings = prepareCalendarJournalSettings(oldSettingsCopy, "day", names, false, false);
        expect(settings.nameTemplate).toBe("{{journal_name}} {{date}}");
        expect(settings.dateFormat).toBe("YYYY--MM--DD");
      });
      it("knows how to convert default daily ribbon", () => {
        const oldSettingsCopy = deepCopy(oldSettings);
        oldSettingsCopy.day.ribbon.show = true;
        const settings = prepareCalendarJournalSettings(oldSettingsCopy, "day", names, false, false);
        expect(settings.commands).toHaveLength(1);
        expect(settings.commands[0].icon).toBe("calendar-days");
        expect(settings.commands[0].name).toBe("Open today's note");
      });

      it("knows how to convert weekly journal default settings", () => {
        const settings = prepareCalendarJournalSettings(oldSettings, "week", names, false, false);
        expect(settings.write).toEqual({
          type: "week",
        });
        expect(settings.name).toBe(names.week);
        expect(settings.nameTemplate).toBe("{{date}}");
        expect(settings.dateFormat).toBe("YYYY-[W]w");
      });
      it("knows how to convert weekly journal custom settings", () => {
        const oldSettingsCopy = deepCopy(oldSettings);
        oldSettingsCopy.week.nameTemplate = "{{journal_name}} {{date}}";
        oldSettingsCopy.week.dateFormat = "[W]ww";
        const settings = prepareCalendarJournalSettings(oldSettingsCopy, "week", names, false, false);
        expect(settings.nameTemplate).toBe("{{journal_name}} {{date}}");
        expect(settings.dateFormat).toBe("[W]ww");
      });
      it("knows how to convert default weekly ribbon", () => {
        const oldSettingsCopy = deepCopy(oldSettings);
        oldSettingsCopy.week.ribbon.show = true;
        const settings = prepareCalendarJournalSettings(oldSettingsCopy, "week", names, false, false);
        expect(settings.commands).toHaveLength(1);
        expect(settings.commands[0].icon).toBe("calendar-days");
        expect(settings.commands[0].name).toBe("Open this week's note");
      });

      it("knows how to convert monthly journal default settings", () => {
        const settings = prepareCalendarJournalSettings(oldSettings, "month", names, false, false);
        expect(settings.write).toEqual({
          type: "month",
        });
        expect(settings.name).toBe(names.month);
        expect(settings.nameTemplate).toBe("{{date}}");
        expect(settings.dateFormat).toBe("YYYY-MM");
      });
      it("knows how to convert monthly journal custom settings", () => {
        const oldSettingsCopy = deepCopy(oldSettings);
        oldSettingsCopy.month.nameTemplate = "{{journal_name}} {{date}}";
        oldSettingsCopy.month.dateFormat = "MMM";
        const settings = prepareCalendarJournalSettings(oldSettingsCopy, "month", names, false, false);
        expect(settings.nameTemplate).toBe("{{journal_name}} {{date}}");
        expect(settings.dateFormat).toBe("MMM");
      });
      it("knows how to convert default monthly ribbon", () => {
        const oldSettingsCopy = deepCopy(oldSettings);
        oldSettingsCopy.month.ribbon.show = true;
        const settings = prepareCalendarJournalSettings(oldSettingsCopy, "month", names, false, false);
        expect(settings.commands).toHaveLength(1);
        expect(settings.commands[0].icon).toBe("calendar-days");
        expect(settings.commands[0].name).toBe("Open this month's note");
      });

      it("knows how to convert quarterly journal default settings", () => {
        const settings = prepareCalendarJournalSettings(oldSettings, "quarter", names, false, false);
        expect(settings.write).toEqual({
          type: "quarter",
        });
        expect(settings.name).toBe(names.quarter);
        expect(settings.nameTemplate).toBe("{{date}}");
        expect(settings.dateFormat).toBe("YYYY-[Q]Q");
      });
      it("knows how to convert quarterly journal custom settings", () => {
        const oldSettingsCopy = deepCopy(oldSettings);
        oldSettingsCopy.quarter.nameTemplate = "{{journal_name}} {{date}}";
        oldSettingsCopy.quarter.dateFormat = "[Q]Q";
        const settings = prepareCalendarJournalSettings(oldSettingsCopy, "quarter", names, false, false);
        expect(settings.nameTemplate).toBe("{{journal_name}} {{date}}");
        expect(settings.dateFormat).toBe("[Q]Q");
      });
      it("knows how to convert default quarterly ribbon", () => {
        const oldSettingsCopy = deepCopy(oldSettings);
        oldSettingsCopy.quarter.ribbon.show = true;
        const settings = prepareCalendarJournalSettings(oldSettingsCopy, "quarter", names, false, false);
        expect(settings.commands).toHaveLength(1);
        expect(settings.commands[0].icon).toBe("calendar-days");
        expect(settings.commands[0].name).toBe("Open this quarter's note");
      });

      it("knows how to convert yearly journal default settings", () => {
        const settings = prepareCalendarJournalSettings(oldSettings, "year", names, false, false);
        expect(settings.write).toEqual({
          type: "year",
        });
        expect(settings.name).toBe(names.year);
        expect(settings.nameTemplate).toBe("{{date}}");
        expect(settings.dateFormat).toBe("YYYY");
      });
      it("knows how to convert yearly journal custom settings", () => {
        const oldSettingsCopy = deepCopy(oldSettings);
        oldSettingsCopy.year.nameTemplate = "{{journal_name}} {{date}}";
        oldSettingsCopy.year.dateFormat = "[My] YYYY";
        const settings = prepareCalendarJournalSettings(oldSettingsCopy, "year", names, false, false);
        expect(settings.nameTemplate).toBe("{{journal_name}} {{date}}");
        expect(settings.dateFormat).toBe("[My] YYYY");
      });
      it("knows how to convert default yearly ribbon", () => {
        const oldSettingsCopy = deepCopy(oldSettings);
        oldSettingsCopy.year.ribbon.show = true;
        const settings = prepareCalendarJournalSettings(oldSettingsCopy, "year", names, false, false);
        expect(settings.commands).toHaveLength(1);
        expect(settings.commands[0].icon).toBe("calendar-days");
        expect(settings.commands[0].name).toBe("Open this year's note");
      });
    });

    describe("update frontmatter", () => {
      const config = ref(deepCopy(defaultJournalSettings));
      config.value.name = names.month;
      config.value.write = {
        type: "month",
      };
      const index = new JournalsIndex();
      const notesManager = new NotesManagerMock();
      const appManager = new AppManagerMock();
      const activeNote = ref(null);
      const journal = new Journal(
        names.month,
        computed(() => config.value),
        index,
        appManager,
        notesManager,
        activeNote,
      );

      it("should update frontmatter for notes in same section", async () => {
        notesManager.registerNote("test.md", "", {
          [FRONTMATTER_NAME_KEY]: oldSettings.id,
          [FRONTMATTER_START_DATE_KEY]: "2022-01-01",
          [FRONTMATTER_END_DATE_KEY]: "2022-01-31",
          [FRONTMATTER_SECTION_KEY]: "month",
        });

        await updateFrontmatterCalendarSection(notesManager, journal, "month", oldSettings);

        expect(notesManager.getNoteMetadata("test.md")?.frontmatter).toStrictEqual({
          [FRONTMATTER_NAME_KEY]: names.month,
          [FRONTMATTER_DATE_KEY]: "2022-01-01",
        });

        notesManager.unregisterNote("test.md");
      });

      it("should keep start and end date if they are configured", async () => {
        notesManager.registerNote("test.md", "", {
          [FRONTMATTER_NAME_KEY]: oldSettings.id,
          [FRONTMATTER_START_DATE_KEY]: "2022-01-01",
          [FRONTMATTER_END_DATE_KEY]: "2022-01-31",
          [FRONTMATTER_SECTION_KEY]: "month",
        });
        config.value.frontmatter.addStartDate = true;
        config.value.frontmatter.addEndDate = true;

        await updateFrontmatterCalendarSection(notesManager, journal, "month", oldSettings);

        expect(notesManager.getNoteMetadata("test.md")?.frontmatter).toStrictEqual({
          [FRONTMATTER_NAME_KEY]: names.month,
          [FRONTMATTER_DATE_KEY]: "2022-01-01",
          [FRONTMATTER_START_DATE_KEY]: "2022-01-01",
          [FRONTMATTER_END_DATE_KEY]: "2022-01-31",
        });

        notesManager.unregisterNote("test.md");
        config.value.frontmatter.addStartDate = false;
        config.value.frontmatter.addEndDate = false;
      });

      it("should skip notes in different section", async () => {
        notesManager.registerNote("test.md", "", {
          [FRONTMATTER_NAME_KEY]: oldSettings.id,
          [FRONTMATTER_START_DATE_KEY]: "2022-01-01",
          [FRONTMATTER_END_DATE_KEY]: "2022-01-01",
          [FRONTMATTER_SECTION_KEY]: "day",
        });

        await updateFrontmatterCalendarSection(notesManager, journal, "month", oldSettings);

        expect(notesManager.getNoteMetadata("test.md")?.frontmatter).toStrictEqual({
          [FRONTMATTER_NAME_KEY]: oldSettings.id,
          [FRONTMATTER_START_DATE_KEY]: "2022-01-01",
          [FRONTMATTER_END_DATE_KEY]: "2022-01-01",
          [FRONTMATTER_SECTION_KEY]: "day",
        });

        notesManager.unregisterNote("test.md");
      });

      it("should skip notes in different journal", async () => {
        notesManager.registerNote("test.md", "", {
          [FRONTMATTER_NAME_KEY]: "other journal",
          [FRONTMATTER_START_DATE_KEY]: "2022-01-01",
          [FRONTMATTER_END_DATE_KEY]: "2022-01-01",
          [FRONTMATTER_SECTION_KEY]: "day",
        });

        await updateFrontmatterCalendarSection(notesManager, journal, "day", oldSettings);

        expect(notesManager.getNoteMetadata("test.md")?.frontmatter).toStrictEqual({
          [FRONTMATTER_NAME_KEY]: "other journal",
          [FRONTMATTER_START_DATE_KEY]: "2022-01-01",
          [FRONTMATTER_END_DATE_KEY]: "2022-01-01",
          [FRONTMATTER_SECTION_KEY]: "day",
        });

        notesManager.unregisterNote("test.md");
      });
    });
  });

  describe("migrate interval journal", () => {
    const oldSettings: IntervalConfig = {
      id: "test-id",
      type: "interval",
      name: "Test Interval",
      duration: 2,
      granularity: "week",
      start_date: "2022-02-01",
      start_index: 1,
      numeration_type: "increment",
      end_type: "never",
      end_date: "",
      repeats: 1,
      limitCreation: false,
      openOnStartup: false,
      openMode: "active",
      nameTemplate: "",
      navNameTemplate: "",
      navDatesTemplate: "",
      dateFormat: "",
      folder: "test-folder",
      template: "",
      ribbon: {
        show: false,
        icon: "",
        tooltip: "",
      },
      createOnStartup: true,
      calendar_view: {
        order: "chrono",
      },
    };

    it("shows how to create custom type", () => {
      const settings = prepareIntervalJournalSettings(oldSettings, false);
      expect(settings.write).toStrictEqual({
        type: "custom",
        anchorDate: oldSettings.start_date,
        every: oldSettings.granularity,
        duration: oldSettings.duration,
      });
    });

    it("knows how to create common settings", () => {
      const settings = prepareIntervalJournalSettings(oldSettings, false);

      expect(settings.name).toBe(oldSettings.name);
      expect(settings.autoCreate).toBe(oldSettings.createOnStartup);
      expect(settings.folder).toBe(oldSettings.folder);
      expect(settings.start).toBe(oldSettings.start_date);
    });

    it("uses default name template if not defined", () => {
      const settings = prepareIntervalJournalSettings(oldSettings, false);

      expect(settings.nameTemplate).toBe("{{journal_name}} {{index}}");
    });
    it("uses custom name template if defined", () => {
      const oldSettingsCopy = deepCopy(oldSettings);
      oldSettingsCopy.nameTemplate = "{{journal_name}} {{index}} {{date}}";

      const settings = prepareIntervalJournalSettings(oldSettingsCopy, false);

      expect(settings.nameTemplate).toBe("{{journal_name}} {{index}} {{date}}");
    });
    it("uses default date format if not defined", () => {
      const settings = prepareIntervalJournalSettings(oldSettings, false);

      expect(settings.dateFormat).toBe("YYYY-MM-DD");
    });
    it("uses custom date format if defined", () => {
      const oldSettingsCopy = deepCopy(oldSettings);
      oldSettingsCopy.dateFormat = "YYYY-MM-DD HH:mm";

      const settings = prepareIntervalJournalSettings(oldSettingsCopy, false);

      expect(settings.dateFormat).toBe("YYYY-MM-DD HH:mm");
    });

    it("adds template to list if defined", () => {
      const oldSettingsCopy = deepCopy(oldSettings);
      oldSettingsCopy.template = "template.md";

      const settings = prepareIntervalJournalSettings(oldSettingsCopy, false);

      expect(settings.templates).toContain("template.md");
    });

    it("knows how to migrate end date", () => {
      const oldSettingsCopy = deepCopy(oldSettings);
      oldSettingsCopy.end_type = "date";
      oldSettingsCopy.end_date = "2025-01-01";

      const settings = prepareIntervalJournalSettings(oldSettingsCopy, false);

      expect(settings.end).toStrictEqual({
        type: "date",
        date: "2025-01-01",
      });
    });

    it("knows how to migrate ends after repeats", () => {
      const oldSettingsCopy = deepCopy(oldSettings);
      oldSettingsCopy.end_type = "repeats";
      oldSettingsCopy.repeats = 5;

      const settings = prepareIntervalJournalSettings(oldSettingsCopy, false);

      expect(settings.end).toStrictEqual({
        type: "repeats",
        repeats: 5,
      });
    });

    it("knows how to migrate increment index", () => {
      const oldSettingsCopy = deepCopy(oldSettings);
      oldSettingsCopy.numeration_type = "increment";

      const settings = prepareIntervalJournalSettings(oldSettingsCopy, false);

      expect(settings.index).toStrictEqual({
        enabled: true,
        anchorDate: oldSettings.start_date,
        anchorIndex: oldSettings.start_index,
        allowBefore: false,
        type: "increment",
        resetAfter: 0,
      });
    });

    it("knows how to migrate year reset for weeks", () => {
      const oldSettingsCopy = deepCopy(oldSettings);
      oldSettingsCopy.numeration_type = "year";
      oldSettingsCopy.granularity = "week";
      oldSettingsCopy.duration = 2;

      const settings = prepareIntervalJournalSettings(oldSettingsCopy, false);

      expect(settings.index).toStrictEqual({
        enabled: true,
        anchorDate: oldSettings.start_date,
        anchorIndex: oldSettings.start_index,
        allowBefore: false,
        type: "reset_after",
        resetAfter: 26,
      });
    });

    it("knows how to migrate year reset for months", () => {
      const oldSettingsCopy = deepCopy(oldSettings);
      oldSettingsCopy.numeration_type = "year";
      oldSettingsCopy.granularity = "month";
      oldSettingsCopy.duration = 3;

      const settings = prepareIntervalJournalSettings(oldSettingsCopy, false);

      expect(settings.index).toStrictEqual({
        enabled: true,
        anchorDate: oldSettings.start_date,
        anchorIndex: oldSettings.start_index,
        allowBefore: false,
        type: "reset_after",
        resetAfter: 4,
      });
    });

    it("knows how to migrate year rest for days", () => {
      const oldSettingsCopy = deepCopy(oldSettings);
      oldSettingsCopy.numeration_type = "year";
      oldSettingsCopy.granularity = "day";
      oldSettingsCopy.duration = 10;

      const settings = prepareIntervalJournalSettings(oldSettingsCopy, false);

      expect(settings.index).toStrictEqual({
        enabled: true,
        anchorDate: oldSettings.start_date,
        anchorIndex: oldSettings.start_index,
        allowBefore: false,
        type: "reset_after",
        resetAfter: 36,
      });
    });

    it("knows how to migrate navNameTemplate", () => {
      const oldSettingsCopy = deepCopy(oldSettings);
      oldSettingsCopy.navNameTemplate = "My {{journal_name}} {{index}}";

      const settings = prepareIntervalJournalSettings(oldSettingsCopy, false);

      expect(settings.navBlock.rows).toEqual([
        {
          ...emptyNavRow,
          template: "My {{journal_name}} {{index}}",
          link: "self",
          fontSize: 3,
          bold: true,
          addDecorations: true,
        },
        {
          ...emptyNavRow,
          template: "{{start_date}}",
        },
        {
          ...emptyNavRow,
          template: "to",
        },
        {
          ...emptyNavRow,
          template: "{{end_date}}",
        },
      ]);
    });

    it("knows how to migrate navDatesTemplate", () => {
      const oldSettingsCopy = deepCopy(oldSettings);
      oldSettingsCopy.navDatesTemplate = "from {{start_date}}|to {{end_date}}";

      const settings = prepareIntervalJournalSettings(oldSettingsCopy, false);

      expect(settings.navBlock.rows).toEqual([
        {
          ...emptyNavRow,
          template: "{{journal_name}} {{index}}",
          link: "self",
          fontSize: 3,
          bold: true,
          addDecorations: true,
        },
        {
          ...emptyNavRow,
          template: "from {{start_date}}",
        },
        {
          ...emptyNavRow,
          template: "to {{end_date}}",
        },
      ]);
    });

    it("enabled dates in frontmatter if requested", () => {
      const settings = prepareIntervalJournalSettings(oldSettings, true);

      expect(settings.frontmatter.addStartDate).toBeTruthy();
      expect(settings.frontmatter.addEndDate).toBeTruthy();
    });

    it("knows how to migrate default ribbon", () => {
      const oldSettingsCopy = deepCopy(oldSettings);
      oldSettingsCopy.ribbon.show = true;

      const settings = prepareIntervalJournalSettings(oldSettingsCopy, false);

      expect(settings.commands).toStrictEqual([
        {
          icon: "calendar-range",
          name: `Open current ${oldSettings.name} note`,
          type: "same",
          context: "today",
          showInRibbon: true,
          openMode: oldSettings.openMode,
        },
      ]);
    });

    it("knows how to migrate custom ribbon", () => {
      const oldSettingsCopy = deepCopy(oldSettings);
      oldSettingsCopy.ribbon.show = true;
      oldSettingsCopy.ribbon.icon = "test-icon";
      oldSettingsCopy.ribbon.tooltip = "test-tooltip";

      const settings = prepareIntervalJournalSettings(oldSettingsCopy, false);

      expect(settings.commands).toStrictEqual([
        {
          icon: "test-icon",
          name: "test-tooltip",
          type: "same",
          context: "today",
          showInRibbon: true,
          openMode: oldSettings.openMode,
        },
      ]);
    });

    describe("update frontmatter", () => {
      const config = ref(deepCopy(defaultJournalSettings));
      config.value.name = oldSettings.name;
      config.value.write = {
        type: "custom",
        anchorDate: JournalAnchorDate("2022-01-01"),
        every: "month",
        duration: 3,
      };
      const index = new JournalsIndex();
      const notesManager = new NotesManagerMock();
      const appManager = new AppManagerMock();
      const activeNote = ref(null);
      const journal = new Journal(
        oldSettings.name,
        computed(() => config.value),
        index,
        appManager,
        notesManager,
        activeNote,
      );

      it("should update frontmatter for notes in same journal", async () => {
        notesManager.registerNote("test.md", "", {
          [FRONTMATTER_NAME_KEY]: oldSettings.id,
          [FRONTMATTER_START_DATE_KEY]: "2022-01-01",
          [FRONTMATTER_END_DATE_KEY]: "2022-03-31",
          [FRONTMATTER_INTERVAL_INDEX_KEY]: 1,
        });

        await updateFrontMatterInterval(notesManager, journal, oldSettings);

        expect(notesManager.getNoteMetadata("test.md")?.frontmatter).toStrictEqual({
          [FRONTMATTER_NAME_KEY]: oldSettings.name,
          [FRONTMATTER_DATE_KEY]: "2022-01-01",
          [FRONTMATTER_INDEX_KEY]: 1,
        });

        notesManager.unregisterNote("test.md");
      });

      it("should keep start and end date if they are configured", async () => {
        notesManager.registerNote("test.md", "", {
          [FRONTMATTER_NAME_KEY]: oldSettings.id,
          [FRONTMATTER_START_DATE_KEY]: "2022-01-01",
          [FRONTMATTER_END_DATE_KEY]: "2022-03-31",
          [FRONTMATTER_INTERVAL_INDEX_KEY]: 1,
        });
        config.value.frontmatter.addStartDate = true;
        config.value.frontmatter.addEndDate = true;

        await updateFrontMatterInterval(notesManager, journal, oldSettings);

        expect(notesManager.getNoteMetadata("test.md")?.frontmatter).toStrictEqual({
          [FRONTMATTER_NAME_KEY]: oldSettings.name,
          [FRONTMATTER_DATE_KEY]: "2022-01-01",
          [FRONTMATTER_START_DATE_KEY]: "2022-01-01",
          [FRONTMATTER_END_DATE_KEY]: "2022-03-31",
          [FRONTMATTER_INDEX_KEY]: 1,
        });

        notesManager.unregisterNote("test.md");
        config.value.frontmatter.addStartDate = false;
        config.value.frontmatter.addEndDate = false;
      });

      it("should add end date if it differs from calculated one", async () => {
        notesManager.registerNote("test-custom.md", "", {
          [FRONTMATTER_NAME_KEY]: oldSettings.id,
          [FRONTMATTER_START_DATE_KEY]: "2022-01-01",
          [FRONTMATTER_END_DATE_KEY]: "2022-01-31",
          [FRONTMATTER_INTERVAL_INDEX_KEY]: 1,
        });

        await updateFrontMatterInterval(notesManager, journal, oldSettings);

        expect(notesManager.getNoteMetadata("test-custom.md")?.frontmatter).toStrictEqual({
          [FRONTMATTER_NAME_KEY]: oldSettings.name,
          [FRONTMATTER_DATE_KEY]: "2022-01-01",
          [FRONTMATTER_END_DATE_KEY]: "2022-01-31",
          [FRONTMATTER_INDEX_KEY]: 1,
        });

        notesManager.unregisterNote("test-custom.md");
      });

      it("should skip notes in different journal", async () => {
        notesManager.registerNote("test.md", "", {
          [FRONTMATTER_NAME_KEY]: "other journal",
          [FRONTMATTER_START_DATE_KEY]: "2022-01-01",
          [FRONTMATTER_END_DATE_KEY]: "2022-01-01",
          [FRONTMATTER_SECTION_KEY]: "day",
        });

        await updateFrontMatterInterval(notesManager, journal, oldSettings);

        expect(notesManager.getNoteMetadata("test.md")?.frontmatter).toStrictEqual({
          [FRONTMATTER_NAME_KEY]: "other journal",
          [FRONTMATTER_START_DATE_KEY]: "2022-01-01",
          [FRONTMATTER_END_DATE_KEY]: "2022-01-01",
          [FRONTMATTER_SECTION_KEY]: "day",
        });

        notesManager.unregisterNote("test.md");
      });
    });
  });
});
