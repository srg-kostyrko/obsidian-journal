import { defaultJournalSettings } from "@/defaults";
import { deepCopy } from "@/utils/misc";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { computed, ref } from "vue";
import { JournalsIndex } from "./journals-index";
import { AppManagerMock } from "@/__mocks__/app-mananger.mock";
import { NotesManagerMock } from "@/__mocks__/notes-manager.mock";
import { Journal } from "./journal";
import { JournalAnchorDate } from "@/types/journal.types";
import { restoreLocale, updateLocale } from "@/calendar";
import type { JournalCommand, JournalDecoration } from "@/types/settings.types";
import {
  FRONTMATTER_DATE_KEY,
  FRONTMATTER_END_DATE_KEY,
  FRONTMATTER_INDEX_KEY,
  FRONTMATTER_NAME_KEY,
  FRONTMATTER_START_DATE_KEY,
} from "@/constants";
import { emptyNavRow } from "./journal-defaults";

describe("Journal", () => {
  beforeAll(() => {
    updateLocale(1, 4);
  });

  afterAll(() => {
    restoreLocale();
  });

  describe("getters", () => {
    const config = ref(deepCopy(defaultJournalSettings));
    config.value.name = "test";
    config.value.write = {
      type: "custom",
      every: "week",
      duration: 2,
      anchorDate: JournalAnchorDate("2022-01-03"),
    };
    const index = new JournalsIndex();
    const appManager = new AppManagerMock();
    const notesManager = new NotesManagerMock();
    const activeNote = ref(null);

    const journal = new Journal(
      config.value.name,
      computed(() => config.value),
      index,
      appManager,
      notesManager,
      activeNote,
    );

    it("should resolve type", () => {
      expect(journal.type).toBe("custom");
    });

    it("should resolve date format", () => {
      expect(journal.dateFormat).toBe(defaultJournalSettings.dateFormat);

      config.value.dateFormat = "[W]w";

      expect(journal.dateFormat).toBe("[W]w");
    });

    it("should resolve nav block settings", () => {
      expect(journal.navBlock).toEqual(defaultJournalSettings.navBlock);

      config.value.navBlock.decorateWholeBlock = true;

      expect(journal.navBlock.decorateWholeBlock).toBe(true);
    });

    it("should resolve calendar view settings", () => {
      expect(journal.calendarViewBlock).toEqual(defaultJournalSettings.calendarViewBlock);

      config.value.calendarViewBlock.decorateWholeBlock = true;

      expect(journal.calendarViewBlock.decorateWholeBlock).toBe(true);
    });

    it("should resolve decorations", () => {
      expect(journal.decorations).toEqual(defaultJournalSettings.decorations);

      config.value.decorations[0].mode = "or";

      expect(journal.decorations[0].mode).toBe("or");
    });

    it("should resolve commands", () => {
      expect(journal.commands).toHaveLength(0);

      const command: JournalCommand = {
        name: "test",
        icon: "calendar",
        type: "next",
        context: "today",
        showInRibbon: true,
        openMode: "active",
      };

      config.value.commands.push(command);

      expect(journal.commands[0]).toEqual(command);
    });

    it("should resolve shelf", () => {
      expect(journal.isOnShelf).toBe(false);
      expect(journal.shelfName).toBe("");

      config.value.shelves.push("test shelf");

      expect(journal.isOnShelf).toBe(true);
      expect(journal.shelfName).toBe("test shelf");
    });

    it("should resolve frontmatter date name", () => {
      expect(journal.frontmatterDate).toBe(FRONTMATTER_DATE_KEY);

      config.value.frontmatter.dateField = "custom-date";

      expect(journal.frontmatterDate).toBe("custom-date");
    });

    it("should resolve frontmatter index name", () => {
      expect(journal.frontmatterIndex).toBe(FRONTMATTER_INDEX_KEY);

      config.value.frontmatter.indexField = "custom-index";

      expect(journal.frontmatterIndex).toBe("custom-index");
    });

    it("should resolve frontmatter start date name", () => {
      expect(journal.frontmatterStartDate).toBe(FRONTMATTER_START_DATE_KEY);

      config.value.frontmatter.startDateField = "custom-start-date";

      expect(journal.frontmatterStartDate).toBe("custom-start-date");
    });

    it("should resolve frontmatter end date", () => {
      expect(journal.frontmatterEndDate).toBe(FRONTMATTER_END_DATE_KEY);

      config.value.frontmatter.endDateField = "custom-end-date";

      expect(journal.frontmatterEndDate).toBe("custom-end-date");
    });
  });

  describe("notes management", () => {
    const config = ref(deepCopy(defaultJournalSettings));
    config.value.name = "test";
    config.value.write = { type: "month" };
    config.value.folder = "test-folder";
    config.value.dateFormat = "YYYY-MM";
    config.value.nameTemplate = "{{date}}";

    const index = new JournalsIndex();
    const appManager = new AppManagerMock();
    const notesManager = new NotesManagerMock();
    const activeNote = ref(null);
    const journal = new Journal(
      config.value.name,
      computed(() => config.value),
      index,
      appManager,
      notesManager,
      activeNote,
    );

    describe("connect note", () => {
      it("should set frontmatter", async () => {
        notesManager.registerNote("test.md", "");

        await journal.connectNote("test.md", JournalAnchorDate("2022-01-01"), {});

        expect(notesManager.getNoteMetadata("test.md")?.frontmatter).toStrictEqual({
          [FRONTMATTER_NAME_KEY]: config.value.name,
          [FRONTMATTER_DATE_KEY]: "2022-01-01",
        });
        notesManager.unregisterNote("test.md");
      });

      it("should move to configured folder is move flag is set", async () => {
        notesManager.registerNote("test.md", "");

        await journal.connectNote("test.md", JournalAnchorDate("2022-01-01"), { move: true });

        expect(notesManager.nodeExists("test-folder/test.md")).toBeTruthy();
        expect(notesManager.nodeExists("test.md")).toBeFalsy();

        notesManager.unregisterNote("test-folder/test.md");
      });

      it("should rename file is rename flag is set", async () => {
        notesManager.registerNote("test.md", "");

        await journal.connectNote("test.md", JournalAnchorDate("2022-01-01"), { rename: true });

        expect(notesManager.nodeExists("2022-01.md")).toBeTruthy();
        expect(notesManager.nodeExists("test.md")).toBeFalsy();
      });

      it("should disconnect existing note if override flag is set", async () => {
        index.registerPathData("first.md", {
          journal: config.value.name,
          date: JournalAnchorDate("2022-01-01"),
          title: "first",
          path: "first.md",
          tags: [],
          properties: {},
          tasks: [],
        });
        notesManager.registerNote("first.md", "", {
          [FRONTMATTER_NAME_KEY]: config.value.name,
          [FRONTMATTER_DATE_KEY]: "2022-01-01",
          other: "should stay",
        });
        notesManager.registerNote("test.md", "");

        await journal.connectNote("test.md", JournalAnchorDate("2022-01-01"), { override: true });

        expect(notesManager.getNoteMetadata("first.md")?.frontmatter).toStrictEqual({
          other: "should stay",
        });
        expect(notesManager.getNoteMetadata("test.md")?.frontmatter).toStrictEqual({
          [FRONTMATTER_NAME_KEY]: config.value.name,
          [FRONTMATTER_DATE_KEY]: "2022-01-01",
        });

        index.unregisterPathData("first.md");
        notesManager.unregisterNote("first.md");
        notesManager.unregisterNote("test.md");
      });

      it("should not touch notes override flag is set", async () => {
        index.registerPathData("first.md", {
          journal: config.value.name,
          date: JournalAnchorDate("2022-01-01"),
          title: "first",
          path: "first.md",
          tags: [],
          properties: {},
          tasks: [],
        });
        notesManager.registerNote("first.md", "", {
          [FRONTMATTER_NAME_KEY]: config.value.name,
          [FRONTMATTER_DATE_KEY]: "2022-01-01",
          other: "should stay",
        });
        notesManager.registerNote("test.md", "");

        await journal.connectNote("test.md", JournalAnchorDate("2022-01-01"), {});

        expect(notesManager.getNoteMetadata("first.md")?.frontmatter).toStrictEqual({
          [FRONTMATTER_NAME_KEY]: config.value.name,
          [FRONTMATTER_DATE_KEY]: "2022-01-01",
          other: "should stay",
        });
        expect(notesManager.getNoteMetadata("test.md")?.frontmatter).toBeUndefined();

        index.unregisterPathData("first.md");
        notesManager.unregisterNote("first.md");
        notesManager.unregisterNote("test.md");
      });
    });
    // connectNote
    it("should clear frontmatter when disconnecting note", async () => {
      notesManager.registerNote("test.md", "", {
        [FRONTMATTER_NAME_KEY]: config.value.name,
        [FRONTMATTER_DATE_KEY]: "2022-01-01",
        [FRONTMATTER_INDEX_KEY]: 1,
        [FRONTMATTER_START_DATE_KEY]: "2022-01-01",
        [FRONTMATTER_END_DATE_KEY]: "2022-01-01",
        other: "should stay",
      });

      await journal.disconnectNote("test.md");

      expect(notesManager.getNoteMetadata("test.md")?.frontmatter).toStrictEqual({
        other: "should stay",
      });

      notesManager.unregisterNote("test.md");
    });

    it("should clear frontmatter in all known notes", async () => {
      index.registerPathData("first.md", {
        journal: config.value.name,
        date: JournalAnchorDate("2022-01-01"),
        title: "first",
        path: "first.md",
        tags: [],
        properties: {},
        tasks: [],
      });
      index.registerPathData("second.md", {
        journal: config.value.name,
        date: JournalAnchorDate("2022-02-01"),
        title: "second",
        path: "second.md",
        tags: [],
        properties: {},
        tasks: [],
      });
      notesManager.registerNote("first.md", "", {
        [FRONTMATTER_NAME_KEY]: config.value.name,
        [FRONTMATTER_DATE_KEY]: "2022-01-01",
        [FRONTMATTER_INDEX_KEY]: 1,
        [FRONTMATTER_START_DATE_KEY]: "2022-01-01",
        [FRONTMATTER_END_DATE_KEY]: "2022-01-31",
        other: "should stay",
      });
      notesManager.registerNote("second.md", "", {
        [FRONTMATTER_NAME_KEY]: config.value.name,
        [FRONTMATTER_DATE_KEY]: "2022-02-01",
        [FRONTMATTER_INDEX_KEY]: 2,
        [FRONTMATTER_START_DATE_KEY]: "2022-02-01",
        [FRONTMATTER_END_DATE_KEY]: "2022-02-28",
        other: "should stay",
      });

      await journal.clearNotes();

      expect(notesManager.getNoteMetadata("first.md")?.frontmatter).toStrictEqual({ other: "should stay" });
      expect(notesManager.getNoteMetadata("second.md")?.frontmatter).toStrictEqual({ other: "should stay" });

      index.clearForPath("first.md");
      index.clearForPath("second.md");
      notesManager.unregisterNote("first.md");
      notesManager.unregisterNote("second.md");
    });

    it("should delete all known nodes", async () => {
      index.registerPathData("first-delete.md", {
        journal: config.value.name,
        date: JournalAnchorDate("2022-01-01"),
        title: "first",
        path: "first.md",
        tags: [],
        properties: {},
        tasks: [],
      });
      index.registerPathData("second-delete.md", {
        journal: config.value.name,
        date: JournalAnchorDate("2022-02-01"),
        title: "second",
        path: "second.md",
        tags: [],
        properties: {},
        tasks: [],
      });
      notesManager.registerNote("first-delete.md", "");
      notesManager.registerNote("second-delete.md", "");

      await journal.deleteNotes();

      expect(notesManager.nodeExists("first-delete.md")).toBeFalsy();
      expect(notesManager.nodeExists("second-delete.md")).toBeFalsy();

      index.clearForPath("first-delete.md");
      index.clearForPath("second-delete.md");
    });
  });

  describe("commands management", () => {
    const config = ref(deepCopy(defaultJournalSettings));
    config.value.name = "test";
    config.value.write = { type: "month" };
    config.value.folder = "test-folder";
    config.value.dateFormat = "YYYY-MM";
    config.value.nameTemplate = "{{date}}";

    const index = new JournalsIndex();
    const appManager = new AppManagerMock();
    const notesManager = new NotesManagerMock();
    const activeNote = ref<string | null>(null);
    const journal = new Journal(
      config.value.name,
      computed(() => config.value),
      index,
      appManager,
      notesManager,
      activeNote,
    );

    it("should register command when adding", () => {
      const command: JournalCommand = {
        name: "test",
        icon: "",
        type: "same",
        context: "today",
        showInRibbon: false,
        openMode: "active",
      };

      journal.addCommand(command);

      expect(config.value.commands.length).toBe(1);
      expect(config.value.commands[0]).toStrictEqual(command);
      expect(appManager.hasCommand(journal.name, command)).toBeTruthy();

      config.value.commands = [];
      appManager.removeCommand(journal.name, command);
    });

    it("should add icon to ribbon when configured", () => {
      const command: JournalCommand = {
        name: "test",
        icon: "gear",
        type: "same",
        context: "today",
        showInRibbon: true,
        openMode: "active",
      };

      journal.addCommand(command);

      expect(config.value.commands.length).toBe(1);
      expect(config.value.commands[0]).toStrictEqual(command);
      expect(appManager.hasRibbonIcon(journal.name, command.name)).toBeTruthy();

      config.value.commands = [];
      appManager.removeCommand(journal.name, command);
      appManager.removeRibbonIcon(journal.name, command.name);
    });

    it("should unregister ribbon if disabled when editing", () => {
      const command: JournalCommand = {
        name: "test",
        icon: "gear",
        type: "same",
        context: "today",
        showInRibbon: true,
        openMode: "active",
      };

      journal.addCommand(command);

      const edited = { ...command, showInRibbon: false };

      journal.updateCommand(0, edited);

      expect(config.value.commands.length).toBe(1);
      expect(config.value.commands[0]).toStrictEqual(edited);
      expect(appManager.hasCommand(journal.name, edited)).toBeTruthy();
      expect(appManager.hasRibbonIcon(journal.name, command.name)).toBeFalsy();

      config.value.commands = [];
      appManager.removeCommand(journal.name, command);
    });

    it("should unregister command and ribbon when removed", () => {
      const command: JournalCommand = {
        name: "test",
        icon: "gear",
        type: "same",
        context: "today",
        showInRibbon: true,
        openMode: "active",
      };

      journal.addCommand(command);

      expect(config.value.commands.length).toBe(1);
      expect(appManager.hasCommand(journal.name, command)).toBeTruthy();
      expect(appManager.hasRibbonIcon(journal.name, command.name)).toBeTruthy();

      journal.deleteCommand(0);

      expect(config.value.commands.length).toBe(0);
      expect(appManager.hasCommand(journal.name, command)).toBeFalsy();
      expect(appManager.hasRibbonIcon(journal.name, command.name)).toBeFalsy();
    });

    describe("command checks", () => {
      it("should pass check for today context", () => {
        const command: JournalCommand = {
          name: "test",
          icon: "gear",
          type: "same",
          context: "today",
          showInRibbon: true,
          openMode: "active",
        };
        journal.addCommand(command);

        expect(appManager.checkCommand(journal.name, command)).toBe(true);

        journal.deleteCommand(0);
      });

      it("should pass check for open_note context", () => {
        const command: JournalCommand = {
          name: "test",
          icon: "gear",
          type: "same",
          context: "open_note",
          showInRibbon: true,
          openMode: "active",
        };
        journal.addCommand(command);

        expect(appManager.checkCommand(journal.name, command)).toBe(true);

        journal.deleteCommand(0);
      });

      describe("only_open_note context check", () => {
        const command: JournalCommand = {
          name: "test",
          icon: "gear",
          type: "same",
          context: "only_open_note",
          showInRibbon: true,
          openMode: "active",
        };

        beforeAll(() => {
          journal.addCommand(command);
        });
        afterAll(() => {
          journal.deleteCommand(0);
        });

        it("should fail check if there is no active note", () => {
          activeNote.value = null;
          expect(appManager.checkCommand(journal.name, command)).toBe(false);
        });

        it("should fail check if active not is not in journal", () => {
          activeNote.value = "not-in-journal.md";
          expect(appManager.checkCommand(journal.name, command)).toBe(false);
        });

        it("should fail check if active note is in different journal", () => {
          index.registerPathData("other-journal.md", {
            journal: "other-journal",
            date: JournalAnchorDate("2021-01-01"),
            title: "other-journal",
            path: "other-journal.md",
            tags: [],
            properties: {},
            tasks: [],
          });
          activeNote.value = "other-journal.md";

          expect(appManager.checkCommand(journal.name, command)).toBe(false);

          index.unregisterPathData("other-journal.md");
        });

        it("should pass check if note is in current journal", () => {
          index.registerPathData("current-journal.md", {
            journal: journal.name,
            date: JournalAnchorDate("2021-01-01"),
            title: "current-journal",
            path: "current-journal.md",
            tags: [],
            properties: {},
            tasks: [],
          });
          activeNote.value = "current-journal.md";

          expect(appManager.checkCommand(journal.name, command)).toBe(true);

          index.unregisterPathData("current-journal.md");
        });
      });
    });

    describe.skip("execute command", () => {
      // TODO
    });
  });

  describe("decorations management", () => {
    const config = ref(deepCopy(defaultJournalSettings));
    config.value.name = "test";
    const index = new JournalsIndex();
    const appManager = new AppManagerMock();
    const notesManager = new NotesManagerMock();
    const activeNote = ref(null);

    const journal = new Journal(
      config.value.name,
      computed(() => config.value),
      index,
      appManager,
      notesManager,
      activeNote,
    );

    it("should add new decoration", () => {
      config.value.decorations = [];

      const decoration: JournalDecoration = {
        mode: "and",
        styles: [],
        conditions: [],
      };

      journal.addDecoration(decoration);

      expect(config.value.decorations.length).toBe(1);
      expect(config.value.decorations[0]).toStrictEqual(decoration);

      config.value.decorations = [];
    });

    it("should edit row", () => {
      const decoration: JournalDecoration = {
        mode: "and",
        styles: [],
        conditions: [],
      };
      config.value.decorations = [decoration];

      const editedRow = deepCopy(decoration);
      editedRow.mode = "or";
      journal.editDecoration(0, editedRow);

      expect(config.value.decorations.length).toBe(1);
      expect(config.value.decorations[0]).toStrictEqual(editedRow);

      config.value.decorations = [];
    });

    it("should delete decoration by index", () => {
      const first: JournalDecoration = {
        mode: "and",
        styles: [],
        conditions: [],
      };
      const second: JournalDecoration = {
        mode: "or",
        styles: [],
        conditions: [],
      };
      const third: JournalDecoration = {
        mode: "and",
        styles: [],
        conditions: [],
      };

      config.value.decorations = [first, second, third];

      journal.deleteDecoration(1);

      expect(config.value.decorations.length).toBe(2);
      expect(config.value.decorations[0]).toStrictEqual(first);
      expect(config.value.decorations[1]).toStrictEqual(third);
    });
  });

  describe("nav block management", () => {
    const config = ref(deepCopy(defaultJournalSettings));
    config.value.name = "test";
    const index = new JournalsIndex();
    const appManager = new AppManagerMock();
    const notesManager = new NotesManagerMock();
    const activeNote = ref(null);

    const journal = new Journal(
      config.value.name,
      computed(() => config.value),
      index,
      appManager,
      notesManager,
      activeNote,
    );

    it("should add new row", () => {
      config.value.navBlock.rows = [];

      const row = deepCopy(emptyNavRow);

      journal.addNavRow(row);

      expect(config.value.navBlock.rows.length).toBe(1);
      expect(config.value.navBlock.rows[0]).toStrictEqual(row);

      config.value.navBlock.rows = [];
    });

    it("should edit row", () => {
      const row = deepCopy(emptyNavRow);
      config.value.navBlock.rows = [row];

      const editedRow = deepCopy(row);
      row.template = "edited";
      journal.editNavRow(0, editedRow);

      expect(config.value.navBlock.rows.length).toBe(1);
      expect(config.value.navBlock.rows[0]).toStrictEqual(editedRow);

      config.value.navBlock.rows = [];
    });

    it("should delete row by index", () => {
      const first = deepCopy(emptyNavRow);
      first.template = "first";
      const second = deepCopy(emptyNavRow);
      second.template = "second";
      const third = deepCopy(emptyNavRow);
      third.template = "third";

      config.value.navBlock.rows = [first, second, third];

      journal.deleteNavRow(1);

      expect(config.value.navBlock.rows.length).toBe(2);
      expect(config.value.navBlock.rows[0]).toStrictEqual(first);
      expect(config.value.navBlock.rows[1]).toStrictEqual(third);
    });

    it('should move row "up"', () => {
      const first = deepCopy(emptyNavRow);
      first.template = "first";
      const second = deepCopy(emptyNavRow);
      second.template = "second";
      const third = deepCopy(emptyNavRow);
      third.template = "third";

      config.value.navBlock.rows = [first, second, third];

      journal.moveNavRowUp(1);

      expect(config.value.navBlock.rows.length).toBe(3);
      expect(config.value.navBlock.rows[0]).toStrictEqual(second);
      expect(config.value.navBlock.rows[1]).toStrictEqual(first);
      expect(config.value.navBlock.rows[2]).toStrictEqual(third);
    });

    it('should move row "down"', () => {
      const first = deepCopy(emptyNavRow);
      first.template = "first";
      const second = deepCopy(emptyNavRow);
      second.template = "second";
      const third = deepCopy(emptyNavRow);
      third.template = "third";

      config.value.navBlock.rows = [first, second, third];

      journal.moveNavRowDown(1);

      expect(config.value.navBlock.rows.length).toBe(3);
      expect(config.value.navBlock.rows[0]).toStrictEqual(first);
      expect(config.value.navBlock.rows[1]).toStrictEqual(third);
      expect(config.value.navBlock.rows[2]).toStrictEqual(second);
    });
  });

  describe("calendar view management", () => {
    const config = ref(deepCopy(defaultJournalSettings));
    config.value.name = "test";
    const index = new JournalsIndex();
    const appManager = new AppManagerMock();
    const notesManager = new NotesManagerMock();
    const activeNote = ref(null);

    const journal = new Journal(
      config.value.name,
      computed(() => config.value),
      index,
      appManager,
      notesManager,
      activeNote,
    );

    it("should add new row", () => {
      config.value.calendarViewBlock.rows = [];

      const row = deepCopy(emptyNavRow);

      journal.addCalendarViewRow(row);

      expect(config.value.calendarViewBlock.rows.length).toBe(1);
      expect(config.value.calendarViewBlock.rows[0]).toStrictEqual(row);

      config.value.calendarViewBlock.rows = [];
    });

    it("should edit row", () => {
      const row = deepCopy(emptyNavRow);
      config.value.calendarViewBlock.rows = [row];

      const editedRow = deepCopy(row);
      row.template = "edited";
      journal.editCalendarViewRow(0, editedRow);

      expect(config.value.calendarViewBlock.rows.length).toBe(1);
      expect(config.value.calendarViewBlock.rows[0]).toStrictEqual(editedRow);

      config.value.calendarViewBlock.rows = [];
    });

    it("should delete row by index", () => {
      const first = deepCopy(emptyNavRow);
      first.template = "first";
      const second = deepCopy(emptyNavRow);
      second.template = "second";
      const third = deepCopy(emptyNavRow);
      third.template = "third";

      config.value.calendarViewBlock.rows = [first, second, third];

      journal.deleteCalendarViewRow(1);

      expect(config.value.calendarViewBlock.rows.length).toBe(2);
      expect(config.value.calendarViewBlock.rows[0]).toStrictEqual(first);
      expect(config.value.calendarViewBlock.rows[1]).toStrictEqual(third);
    });

    it('should move row "up"', () => {
      const first = deepCopy(emptyNavRow);
      first.template = "first";
      const second = deepCopy(emptyNavRow);
      second.template = "second";
      const third = deepCopy(emptyNavRow);
      third.template = "third";

      config.value.calendarViewBlock.rows = [first, second, third];

      journal.moveCalendarViewRowUp(1);

      expect(config.value.calendarViewBlock.rows.length).toBe(3);
      expect(config.value.calendarViewBlock.rows[0]).toStrictEqual(second);
      expect(config.value.calendarViewBlock.rows[1]).toStrictEqual(first);
      expect(config.value.calendarViewBlock.rows[2]).toStrictEqual(third);
    });

    it('should move row "down"', () => {
      const first = deepCopy(emptyNavRow);
      first.template = "first";
      const second = deepCopy(emptyNavRow);
      second.template = "second";
      const third = deepCopy(emptyNavRow);
      third.template = "third";

      config.value.calendarViewBlock.rows = [first, second, third];

      journal.moveCalendarViewRowDown(1);

      expect(config.value.calendarViewBlock.rows.length).toBe(3);
      expect(config.value.calendarViewBlock.rows[0]).toStrictEqual(first);
      expect(config.value.calendarViewBlock.rows[1]).toStrictEqual(third);
      expect(config.value.calendarViewBlock.rows[2]).toStrictEqual(second);
    });
  });

  describe.skip("start writing", () => {
    // startDate
  });

  describe.skip("end writing", () => {
    // endDate
  });

  describe("frontmatter management", () => {
    const config = ref(deepCopy(defaultJournalSettings));
    config.value.name = "test";
    config.value.write = { type: "month" };

    const index = new JournalsIndex();
    index.registerPathData("test.md", {
      journal: "test",
      date: JournalAnchorDate("2022-01-01"),
      title: "test",
      path: "test.md",
      tags: [],
      properties: {},
      tasks: [],
    });

    const appManager = new AppManagerMock();
    const notesManager = new NotesManagerMock();
    notesManager.registerNote("test.md", "", {
      [FRONTMATTER_NAME_KEY]: config.value.name,
      [FRONTMATTER_DATE_KEY]: "2022-01-01",
    });
    const activeNote = ref(null);

    const journal = new Journal(
      config.value.name,
      computed(() => config.value),
      index,
      appManager,
      notesManager,
      activeNote,
    );

    it("should rename frontmatter field and update data in note frontmatter", async () => {
      await journal.renameFrontmatterField("dateField", FRONTMATTER_DATE_KEY, "custom-date");

      expect(notesManager.getNoteMetadata("test.md")?.frontmatter).toEqual({
        [FRONTMATTER_NAME_KEY]: config.value.name,
        "custom-date": "2022-01-01",
      });
      expect(journal.frontmatterDate).toBe("custom-date");

      await journal.renameFrontmatterField("dateField", "custom-date", FRONTMATTER_DATE_KEY);

      expect(notesManager.getNoteMetadata("test.md")?.frontmatter).toEqual({
        [FRONTMATTER_NAME_KEY]: config.value.name,
        [FRONTMATTER_DATE_KEY]: "2022-01-01",
      });
      expect(journal.frontmatterDate).toBe(FRONTMATTER_DATE_KEY);
    });

    it("should ot touch note frontmatter if field is currently not in use", async () => {
      await journal.renameFrontmatterField("startDateField", FRONTMATTER_START_DATE_KEY, "custom-start-date");

      expect(journal.frontmatterStartDate).toBe("custom-start-date");
      expect(notesManager.getNoteMetadata("test.md")?.frontmatter).toStrictEqual({
        [FRONTMATTER_NAME_KEY]: config.value.name,
        [FRONTMATTER_DATE_KEY]: "2022-01-01",
      });

      await journal.renameFrontmatterField("startDateField", "custom-start-date", FRONTMATTER_START_DATE_KEY);
    });

    it("should toggle start date and update data in note frontmatter", async () => {
      await journal.toggleFrontmatterStartDate();

      expect(notesManager.getNoteMetadata("test.md")?.frontmatter).toStrictEqual({
        [FRONTMATTER_NAME_KEY]: config.value.name,
        [FRONTMATTER_DATE_KEY]: "2022-01-01",
        [FRONTMATTER_START_DATE_KEY]: "2022-01-01",
      });

      await journal.toggleFrontmatterStartDate();

      expect(notesManager.getNoteMetadata("test.md")?.frontmatter).toStrictEqual({
        [FRONTMATTER_NAME_KEY]: config.value.name,
        [FRONTMATTER_DATE_KEY]: "2022-01-01",
      });
    });

    it("should toggle end date and update data in note frontmatter", async () => {
      await journal.toggleFrontmatterEndDate();

      expect(notesManager.getNoteMetadata("test.md")?.frontmatter).toStrictEqual({
        [FRONTMATTER_NAME_KEY]: config.value.name,
        [FRONTMATTER_DATE_KEY]: "2022-01-01",
        [FRONTMATTER_END_DATE_KEY]: "2022-01-31",
      });

      await journal.toggleFrontmatterEndDate();

      expect(notesManager.getNoteMetadata("test.md")?.frontmatter).toStrictEqual({
        [FRONTMATTER_NAME_KEY]: config.value.name,
        [FRONTMATTER_DATE_KEY]: "2022-01-01",
      });
    });

    it("should keep end date in frontmatter if it is custom event if end date is disabled", async () => {
      index.registerPathData("custom_end_date.md", {
        journal: config.value.name,
        date: JournalAnchorDate("2022-02-01"),
        end_date: JournalAnchorDate("2022-02-15"),
        title: "custom_end_date",
        path: "custom_end_date.md",
        tags: [],
        properties: {},
        tasks: [],
      });
      notesManager.registerNote("custom_end_date.md", "", {
        [FRONTMATTER_NAME_KEY]: config.value.name,
        [FRONTMATTER_DATE_KEY]: "2022-02-01",
        [FRONTMATTER_END_DATE_KEY]: "2022-02-15",
      });

      await journal.toggleFrontmatterEndDate();

      expect(notesManager.getNoteMetadata("custom_end_date.md")?.frontmatter).toStrictEqual({
        [FRONTMATTER_NAME_KEY]: config.value.name,
        [FRONTMATTER_DATE_KEY]: "2022-02-01",
        [FRONTMATTER_END_DATE_KEY]: "2022-02-15",
      });

      await journal.toggleFrontmatterEndDate();

      expect(notesManager.getNoteMetadata("custom_end_date.md")?.frontmatter).toStrictEqual({
        [FRONTMATTER_NAME_KEY]: config.value.name,
        [FRONTMATTER_DATE_KEY]: "2022-02-01",
        [FRONTMATTER_END_DATE_KEY]: "2022-02-15",
      });
    });
  });

  describe.skip("note indexing", () => {
    //
  });
});
