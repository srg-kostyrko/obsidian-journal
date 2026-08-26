export const icons = {
  action: {
    edit: "pencil",
    configure: "settings",
    delete: "trash-2",
    add: "plus",
    addFile: "file-plus",
    bulkAdd: "import",
    copy: "copy",
    openExternal: "external-link",
    pickDate: "crosshair",
    calendar: "calendar",
    check: "lucide-check",
    moveUp: "chevron-up",
    moveDown: "chevron-down",
    dragHandle: "grip-vertical",
    reset: "rotate-ccw",
    search: "search",
    close: "x",
    sort: "arrow-up-down",
    sortAscending: "arrow-up-narrow-wide",
    sortDescending: "arrow-down-wide-narrow",
  },
  nav: {
    prev: "chevron-left",
    next: "chevron-right",
    prevLeap: "chevrons-left",
    nextLeap: "chevrons-right",
    back: "chevron-left",
  },
  entity: {
    journal: "book-open",
    shelf: "library",
    view: "layout-dashboard",
    command: "square-terminal",
    month: "calendar-days",
    week: "calendar-range",
    customInterval: "list",
    navBlock: "signpost-big",
  },
  block: {
    divider: "minus",
    toolbar: "panel-top",
    markdownTemplate: "file-text",
    button: "square",
    existingNavigation: "chevrons-left-right",
    spacer: "move-horizontal",
  },
  // Mirrors the icons Obsidian shows for each frontmatter property type.
  propertyType: {
    text: "lucide-text",
    multitext: "lucide-list",
    number: "lucide-binary",
    checkbox: "lucide-check-square",
    date: "lucide-calendar",
    datetime: "lucide-clock",
    aliases: "lucide-forward",
    tags: "lucide-tags",
    unknown: "lucide-file-question",
  },
  // Whether a listed problem is one the plugin will repair or one only the user can settle.
  status: {
    willFix: "lucide-check",
    needsYou: "lucide-alert-triangle",
  },
  section: {
    calendar: "calendar",
    numbering: "hash",
    appearance: "palette",
    decorations: "paintbrush",
    logging: "scroll-text",
    startup: "log-in",
    properties: "table-properties",
    templates: "notepad-text-dashed",
    timeline: "calendar-range",
    maintenance: "wrench",
    notePreview: "panel-bottom",
  },
} as const;

const propertyTypeIcons = new Map<string, string>(Object.entries(icons.propertyType));

export function propertyTypeIcon(type: string | null): string {
  return propertyTypeIcons.get(type ?? "") ?? icons.propertyType.unknown;
}

export type IconName = {
  [Group in keyof typeof icons]: (typeof icons)[Group][keyof (typeof icons)[Group]];
}[keyof typeof icons];
