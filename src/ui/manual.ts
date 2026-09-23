export const MANUAL_BASE = "https://srg-kostyrko.github.io/obsidian-journal";

// Shipped links are checked against every release tag by scripts/docs-manual-links.mjs, which reads
// this file's string literals by pattern: keep every value a plain /page or /page#fragment path,
// with no quoted example paths in comments — the same pattern would pick those up too.
export const manual = {
  journal: {
    page: "/journals",
    creating: "/journals#creating-a-journal",
    noteCreation: "/journals#note-creation",
    templates: "/journals#templates",
    timeline: "/journals#timeline",
    sequentialNumbers: "/journals#sequential-numbers",
    frontmatter: "/journals#frontmatter",
  },
  shelf: {
    page: "/shelves",
    creating: "/shelves#creating-shelves",
    placing: "/shelves#putting-a-journal-on-a-shelf",
    commands: "/shelves#commands-on-a-shelf",
  },
  notelet: {
    page: "/notelets",
    addingType: "/notelets#adding-a-notelet-type",
  },
  questions: {
    page: "/questions",
  },
  commands: {
    yourOwn: "/commands#commands-you-create",
  },
  view: {
    settings: "/views#a-view-s-settings",
    blocks: "/views#blocks",
    notesByDate: "/views#notes-by-date",
    calendars: "/views#month-calendar-and-week-calendar",
  },
  startup: {
    openOnStartup: "/notes#opening-a-note-when-obsidian-starts",
  },
  period: {
    weeks: "/periods#weeks",
  },
  navigation: {
    page: "/navigation-blocks",
    intervalLines: "/navigation-blocks#calendar-interval-lines",
  },
  decorations: {
    owners: "/decorations#where-decorations-live",
  },
  tasks: {
    page: "/tasks",
    journalRule: "/tasks#a-journal-s-own-rule",
  },
  troubleshooting: {
    collidingJournals: "/troubleshooting#two-journals-fight-over-the-same-notes",
    reportingBug: "/troubleshooting#reporting-a-bug",
    maintenance: "/troubleshooting#maintenance",
    snapshots: "/troubleshooting#settings-snapshots",
    vaultCheck: "/troubleshooting#vault-check",
  },
  guides: {
    importing: "/guides/from-periodic-notes#importing-your-settings",
  },
} as const;

export type ManualPath = {
  [Group in keyof typeof manual]: (typeof manual)[Group][keyof (typeof manual)[Group]];
}[keyof typeof manual];

export function manualUrl(path: ManualPath): string {
  return MANUAL_BASE + path;
}
