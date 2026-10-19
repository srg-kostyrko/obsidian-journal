// A stand-in for TaskNotes 4.13.9: Journals reads only the `settings` field of the live plugin, so
// that is all this carries. Defaults are TaskNotes' own, except the two fields the spec needs to
// differ from Journals' defaults, or the copy could not be told apart from merely turning on.
const { Plugin } = require("obsidian");

module.exports = class TaskNotesStub extends Plugin {
  onload() {
    this.settings = {
      taskIdentificationMethod: "tag",
      taskTag: "chore",
      taskPropertyName: "",
      taskPropertyValue: "",
      excludedFolders: "Archive/",
      defaultTaskStatus: "open",
      fieldMapping: {
        status: "status",
        due: "due",
        scheduled: "scheduled",
        title: "title",
        completedDate: "completedDate",
        dateCreated: "dateCreated",
        dateModified: "dateModified",
        recurrence: "recurrence",
        recurrenceParent: "recurrence_parent",
        archiveTag: "archived",
      },
      customStatuses: [
        { value: "none", isCompleted: false, order: 0 },
        { value: "open", isCompleted: false, order: 1 },
        { value: "in-progress", isCompleted: false, order: 2 },
        { value: "done", isCompleted: true, order: 3 },
      ],
    };
  }
};
