import { nanoid } from "nanoid";
import { match } from "ts-pattern";

import type { Migration } from "@/settings";
import type { View, ViewBlockInstance } from "@/views";
import { DEFAULT_CALENDAR_VIEW_ID, defaultCalendarView } from "@/views/default-view";

import type { OldJournalCommand, OldJournalSettings, OldPluginCommand, OldPluginSettings } from "./old-shapes";

type CommandTarget =
  | { kind: "all"; writeType: OldPluginCommand["writeType"] }
  | { kind: "journal"; journalName: string }
  | { kind: "shelf"; shelfName: string; writeType: OldPluginCommand["writeType"] };

function mapEnd(end: OldJournalSettings["end"]): Record<string, unknown> {
  return match(end)
    .with({ type: "never" }, () => ({ kind: "never" }))
    .with({ type: "date" }, ({ date }) => ({ kind: "date", date }))
    .with({ type: "repeats" }, ({ repeats }) => ({ kind: "repeats", count: repeats }))
    .exhaustive();
}

function mapMode(mode: "navigate" | "create" | "switch_date"): "navigate" | "create" | "select-only" {
  return match(mode)
    .with("navigate", () => "navigate" as const)
    .with("create", () => "create" as const)
    .with("switch_date", () => "select-only" as const)
    .exhaustive();
}

function reshapeJournal(old: OldJournalSettings): Record<string, unknown> {
  return {
    name: old.name,
    write: old.write,
    confirmCreation: old.confirmCreation,
    autoCreate: old.autoCreate,
    nameTemplate: old.nameTemplate,
    dateFormat: old.dateFormat,
    folder: old.folder,
    templates: old.templates,
    decorations: old.decorations,
    navBlock: old.navBlock,
    timeline: { start: old.start, end: mapEnd(old.end) },
    numbering: {
      enabled: old.index.enabled,
      anchorDate: old.index.anchorDate,
      allowBefore: old.index.allowBefore,
      sources: [
        {
          variable: "index",
          frontmatterKey: old.frontmatter.indexField,
          anchorValue: old.index.anchorIndex,
          reset: old.index.type === "reset_after" ? { kind: "after", count: old.index.resetAfter } : { kind: "never" },
        },
      ],
    },
    intervalBlock: {
      type: "create",
      rows: old.calendarViewBlock.rows,
      decorateWholeBlock: old.calendarViewBlock.decorateWholeBlock,
    },
    frontmatter: {
      dateField: old.frontmatter.dateField,
      startDateField: old.frontmatter.startDateField,
      endDateField: old.frontmatter.endDateField,
      addStartDate: old.frontmatter.addStartDate,
      addEndDate: old.frontmatter.addEndDate,
    },
  };
}

function reshapeCommand(
  cmd: OldPluginCommand | OldJournalCommand,
  target: CommandTarget,
  context: OldJournalCommand["context"],
): Record<string, unknown> {
  return {
    name: cmd.name,
    icon: cmd.icon,
    showInRibbon: cmd.showInRibbon,
    openMode: cmd.openMode,
    type: cmd.type,
    context,
    target,
  };
}

function reshapeCalendar(cal: OldPluginSettings["calendar"]): Record<string, unknown> {
  return cal.dow === -1 ? { mode: "locale" } : { mode: "custom", dow: cal.dow, doy: cal.doy, global: cal.global };
}

function reshapeAppearance(cv: OldPluginSettings["calendarView"] | undefined): Record<string, unknown> | undefined {
  if (!cv?.todayStyle || !cv.activeStyle) return undefined;
  return {
    today: { color: cv.todayStyle.color, background: cv.todayStyle.background },
    active: { color: cv.activeStyle.color, background: cv.activeStyle.background },
  };
}

interface ToolbarItem {
  config?: { action?: { type?: string; mode?: string } };
}

function patchToolbarModes(toolbar: ViewBlockInstance, cv: NonNullable<OldPluginSettings["calendarView"]>): void {
  const items = toolbar.config.items;
  if (!Array.isArray(items)) return;
  for (const item of items as ToolbarItem[]) {
    const action = item.config?.action;
    if (action?.type === "current") action.mode = mapMode(cv.todayMode);
    if (action?.type === "pick-date") action.mode = mapMode(cv.pickMode);
  }
}

function reshapeViews(cv: OldPluginSettings["calendarView"] | undefined): Record<string, unknown> | undefined {
  if (!cv) return undefined;

  const view: View = structuredClone(defaultCalendarView());
  view.leaf = cv.leaf;

  const monthBlock = view.blocks.find((b) => b.key === "month-calendar");
  if (monthBlock) monthBlock.config.weeks = cv.weeks;

  const toolbar = view.blocks.find((b) => b.key === "toolbar");
  if (toolbar) patchToolbarModes(toolbar, cv);

  if (cv.display === "week" && monthBlock) {
    const index = view.blocks.indexOf(monthBlock);
    view.blocks[index] = {
      id: monthBlock.id,
      key: "week-calendar",
      config: { before: 0, after: 0, hideWeekends: false, weeks: cv.weeks },
    };
  }

  return { [DEFAULT_CALENDAR_VIEW_ID]: view };
}

export const v3ToV4Migration: Migration = {
  fromVersion: 3,
  toVersion: 4,
  migrate(raw) {
    const old = raw as unknown as OldPluginSettings;

    const journals: Record<string, unknown> = {};
    const shelves: Record<string, unknown> = {};
    const commands: Record<string, unknown> = {};

    for (const journal of Object.values(old.journals ?? {})) {
      journals[nanoid()] = reshapeJournal(journal);
      for (const cmd of journal.commands ?? []) {
        commands[nanoid()] = reshapeCommand(cmd, { kind: "journal", journalName: journal.name }, cmd.context);
      }
    }

    for (const shelf of Object.values(old.shelves ?? {})) {
      shelves[nanoid()] = { name: shelf.name, journals: shelf.journals };
      for (const cmd of shelf.commands ?? []) {
        commands[nanoid()] = reshapeCommand(
          cmd,
          { kind: "shelf", shelfName: shelf.name, writeType: cmd.writeType },
          "today",
        );
      }
    }

    for (const cmd of old.commands ?? []) {
      commands[nanoid()] = reshapeCommand(cmd, { kind: "all", writeType: cmd.writeType }, "today");
    }

    const output: Record<string, unknown> = {
      journals,
      shelves,
      commands,
      calendar: reshapeCalendar(old.calendar),
      startup: { journalName: old.openOnStartup ?? "" },
      pendingNoteMigration: old.pendingNoteMigration ?? [],
    };

    const appearance = reshapeAppearance(old.calendarView);
    if (appearance) output.appearance = appearance;

    const views = reshapeViews(old.calendarView);
    if (views) output.views = views;

    return output;
  },
};
