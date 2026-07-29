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
    definedNavigation: "chevrons-left-right",
    spacer: "move-horizontal",
  },
  section: {
    numbering: "hash",
    appearance: "palette",
    decorations: "paintbrush",
    logging: "scroll-text",
    startup: "log-in",
    properties: "table-properties",
    templates: "notepad-text-dashed",
    timeline: "calendar-range",
  },
} as const;

export type IconName = {
  [Group in keyof typeof icons]: (typeof icons)[Group][keyof (typeof icons)[Group]];
}[keyof typeof icons];
