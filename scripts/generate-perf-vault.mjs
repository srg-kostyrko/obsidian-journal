#!/usr/bin/env node
// Builds perf-vault/: 12 journals (every write type, on-shelf and off-shelf) and N years of
// notes for each. The plugin binaries are symlinked to test-vault's, which is where
// `npm run dev` writes, so hot reload drives both vaults; data.json stays per-vault.
//
//   node scripts/generate-perf-vault.mjs [--out DIR] [--start YYYY-MM-DD] [--years N] [--clean]

import { cp, mkdir, rm, symlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import moment from "moment";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// Pinned so week anchors are Mondays regardless of the host locale, and so the vault's
// calendar slice (written below) matches the grid these notes were generated on.
const WEEK = { dow: 1, doy: 4 };
moment.locale("en");
moment.updateLocale("en", { week: WEEK });

const SETTINGS_VERSION = 4;

function parseArgs(argv) {
  const args = { out: "perf-vault", start: "2022-01-01", years: 5, clean: false };
  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i];
    if (flag === "--clean") args.clean = true;
    else if (flag === "--out") args.out = argv[++i];
    else if (flag === "--start") args.start = argv[++i];
    else if (flag === "--years") args.years = Number(argv[++i]);
    else throw new Error(`unknown flag: ${flag}`);
  }
  if (!moment(args.start, "YYYY-MM-DD", true).isValid()) throw new Error(`--start must be YYYY-MM-DD`);
  if (!Number.isInteger(args.years) || args.years < 1) throw new Error(`--years must be a positive integer`);
  return args;
}

// --- journal definitions ---

const themeColor = (name) => ({ type: "theme", name });
const customColor = (color) => ({ type: "custom", color });

const side = (show, color, width = 2) => ({ show, width, style: "solid", color });

function borderLeft(color) {
  return {
    type: "border",
    border: "different",
    left: side(true, customColor(color), 3),
    right: side(false, { type: "transparent" }),
    top: side(false, { type: "transparent" }),
    bottom: side(false, { type: "transparent" }),
  };
}

const decoration = (conditions, styles) => ({ mode: "and", conditions, styles });

const shape = (color, shape_ = "circle", size = 0.4) => ({
  type: "shape",
  size,
  shape: shape_,
  color,
  placement_x: "center",
  placement_y: "bottom",
});

const corner = (placement, color) => ({ type: "corner", placement, color });

// Mirrors journalDefaultsFor()'s nav blocks in src/journals/config.ts. The schema's own fallback
// for an absent navBlock is an *empty* block, so a fixture that omits these gets journals whose
// nav fences render nothing — the defaults have to be written out.
const emptyNavRow = {
  template: "",
  fontSize: 1,
  bold: false,
  italic: false,
  link: "none",
  journal: "",
  color: themeColor("text-normal"),
  background: { type: "transparent" },
  addDecorations: false,
};

const rowNavWeek = { ...emptyNavRow, template: "{{date:[W]w}}", link: "week" };
const rowNavMonth = { ...emptyNavRow, template: "{{date:MMMM}}", link: "month" };
const rowNavYear = { ...emptyNavRow, template: "{{date:YYYY}}", link: "year" };
const rowNavRelative = { ...emptyNavRow, template: "{{relative_date}}", fontSize: 0.7 };

const defaultNavBlocks = {
  day: {
    type: "create",
    decorateWholeBlock: false,
    rows: [
      { ...emptyNavRow, template: "{{date:ddd}}" },
      { ...emptyNavRow, template: "{{date:D}}", fontSize: 3, bold: true, link: "self", addDecorations: true },
      rowNavRelative,
      rowNavWeek,
      rowNavMonth,
      rowNavYear,
    ],
  },
  week: {
    type: "create",
    decorateWholeBlock: false,
    rows: [
      { ...rowNavWeek, fontSize: 3, bold: true, link: "self", addDecorations: true },
      rowNavRelative,
      rowNavMonth,
      rowNavYear,
    ],
  },
  month: {
    type: "create",
    decorateWholeBlock: false,
    rows: [{ ...rowNavMonth, fontSize: 3, bold: true, link: "self", addDecorations: true }, rowNavRelative, rowNavYear],
  },
  quarter: {
    type: "create",
    decorateWholeBlock: false,
    rows: [
      { ...emptyNavRow, template: "{{date:[Q]Q}}", fontSize: 3, bold: true, link: "self", addDecorations: true },
      rowNavRelative,
      rowNavYear,
    ],
  },
  year: {
    type: "create",
    decorateWholeBlock: false,
    rows: [{ ...rowNavYear, fontSize: 3, bold: true, link: "self", addDecorations: true }, rowNavRelative],
  },
  custom: {
    type: "create",
    decorateWholeBlock: false,
    rows: [
      {
        ...emptyNavRow,
        template: "{{journal_name}} {{index}}",
        link: "self",
        fontSize: 3,
        bold: true,
        addDecorations: true,
      },
      { ...emptyNavRow, template: "{{start_date}}" },
      { ...emptyNavRow, template: "to" },
      { ...emptyNavRow, template: "{{end_date}}" },
    ],
  },
};

const emptyIntervalBlock = { type: "create", rows: [], decorateWholeBlock: false };

const customIntervalBlock = {
  type: "create",
  decorateWholeBlock: true,
  rows: [
    { ...emptyNavRow, template: "{{journal_name}} {{index}}", link: "self", fontSize: 1.2, bold: true },
    { ...emptyNavRow, template: "{{start_date}} to {{end_date}}" },
  ],
};

// Every journal below is spelled out rather than derived from journalDefaultsFor(), so the
// fixture stays readable and reviewable as data. Only the fields that differ per journal live
// here; journalConfig() fills in the shared defaults.
const journals = [
  {
    name: "daily",
    shelf: "work",
    write: { type: "day" },
    folder: "shelved/day/{{date:YYYY}}",
    dateFormat: "YYYY-MM-DD",
    decorations: [
      decoration(
        [{ type: "tag", condition: "contains", value: "focus" }],
        [
          {
            type: "icon",
            icon: "star",
            placement_x: "right",
            placement_y: "top",
            color: customColor("#e0a030"),
            size: 0.5,
          },
        ],
      ),
      decoration([{ type: "all-tasks-completed" }], [corner("top-left", customColor("#40c040"))]),
      decoration(
        [{ type: "property", name: "holiday", valueType: "checkbox", condition: "is-true" }],
        [{ type: "background", color: customColor("#2d4a2d") }],
      ),
      decoration([{ type: "has-note" }], [shape(themeColor("interactive-accent"))]),
    ],
  },
  {
    name: "weekly",
    shelf: "work",
    write: { type: "week" },
    folder: "shelved/week",
    dateFormat: "YYYY-[W]ww",
    decorations: [
      decoration([{ type: "has-open-task" }], [corner("bottom-right", customColor("#c04040"))]),
      decoration([{ type: "has-note" }], [shape(themeColor("interactive-accent"))]),
    ],
  },
  {
    name: "monthly",
    shelf: "personal",
    write: { type: "month" },
    folder: "shelved/month",
    dateFormat: "YYYY-MM",
    decorations: [
      decoration(
        [{ type: "property", name: "mood", valueType: "text", condition: "eq", value: "good" }],
        [{ type: "color", color: customColor("#7cc47c") }],
      ),
      decoration([{ type: "has-note" }], [shape(themeColor("interactive-accent"))]),
    ],
  },
  {
    name: "quarterly",
    shelf: "personal",
    write: { type: "quarter" },
    folder: "shelved/quarter",
    dateFormat: "YYYY-[Q]Q",
    decorations: [decoration([{ type: "has-note" }], [shape(themeColor("interactive-accent"), "square", 0.5)])],
  },
  {
    name: "yearly",
    shelf: "personal",
    write: { type: "year" },
    folder: "shelved/year",
    dateFormat: "YYYY",
    decorations: [decoration([{ type: "has-note" }], [{ type: "background", color: customColor("#203040") }])],
  },
  {
    name: "sprint",
    shelf: "work",
    write: { type: "custom", every: "week", duration: 2, anchorDate: "2022-01-03" },
    folder: "shelved/sprint",
    dateFormat: "YYYY-MM-DD",
    nameTemplate: "{{journal_name}} {{index}}",
    decorations: [decoration([{ type: "has-note" }], [borderLeft("#b060c0")])],
  },
  {
    name: "daily-solo",
    write: { type: "day" },
    folder: "solo/day/{{date:YYYY}}",
    dateFormat: "YYYY.MM.DD",
    decorations: [
      decoration(
        [{ type: "tag", condition: "contains", value: "focus" }],
        [corner("top-right", customColor("#4080c0"))],
      ),
      decoration([{ type: "has-note" }], [shape(customColor("#4080c0"), "triangle-up", 0.35)]),
    ],
  },
  {
    name: "weekly-solo",
    write: { type: "week" },
    folder: "solo/week",
    dateFormat: "YYYY.[W]ww",
    decorations: [decoration([{ type: "has-note" }], [shape(customColor("#4080c0"), "triangle-up", 0.35)])],
  },
  {
    name: "monthly-solo",
    write: { type: "month" },
    folder: "solo/month",
    dateFormat: "YYYY.MM",
    decorations: [decoration([{ type: "has-note" }], [shape(customColor("#4080c0"), "triangle-up", 0.35)])],
  },
  {
    name: "quarterly-solo",
    write: { type: "quarter" },
    folder: "solo/quarter",
    dateFormat: "YYYY.[Q]Q",
    decorations: [decoration([{ type: "has-note" }], [shape(customColor("#4080c0"), "triangle-up", 0.35)])],
  },
  {
    name: "yearly-solo",
    write: { type: "year" },
    folder: "solo/year",
    dateFormat: "[Y]YYYY",
    decorations: [decoration([{ type: "has-note" }], [shape(customColor("#4080c0"), "triangle-up", 0.35)])],
  },
  {
    name: "cycle-solo",
    write: { type: "custom", every: "day", duration: 10, anchorDate: "2022-01-01" },
    folder: "solo/cycle",
    dateFormat: "YYYY-MM-DD",
    nameTemplate: "{{journal_name}} {{index}}",
    decorations: [decoration([{ type: "has-note" }], [borderLeft("#4080c0")])],
  },
];

const shelves = {
  work: {
    name: "work",
    journals: journals.filter((j) => j.shelf === "work").map((j) => j.name),
    decorations: [decoration([{ type: "weekday", weekdays: [5] }], [{ type: "color", color: customColor("#c08040") }])],
  },
  personal: {
    name: "personal",
    journals: journals.filter((j) => j.shelf === "personal").map((j) => j.name),
    decorations: [
      decoration([{ type: "date", day: 15, month: -1, year: null }], [shape(customColor("#8060c0"), "square", 0.3)]),
    ],
  },
};

// Vault-wide decorations only accept date/weekday conditions.
const vaultDecorations = [
  decoration([{ type: "weekday", weekdays: [0, 6] }], [{ type: "background", color: customColor("#2a2a33") }]),
  decoration([{ type: "date", day: 1, month: 0, year: null }], [corner("bottom-left", customColor("#c0c040"))]),
];

function isCustom(journal) {
  return journal.write.type === "custom";
}

function nameTemplateOf(journal) {
  return journal.nameTemplate ?? "{{date}}";
}

function journalConfig(journal) {
  const custom = isCustom(journal);
  return {
    name: journal.name,
    write: journal.write,
    folder: journal.folder,
    nameTemplate: nameTemplateOf(journal),
    dateFormat: journal.dateFormat,
    timeline: { start: custom ? journal.write.anchorDate : "", end: { kind: "never" } },
    frontmatter: {
      dateField: "journal-date",
      startDateField: "journal-start-date",
      endDateField: "journal-end-date",
      addStartDate: custom,
      addEndDate: custom,
    },
    numbering: custom
      ? {
          enabled: true,
          anchorDate: journal.write.anchorDate,
          allowBefore: false,
          sources: [{ variable: "index", frontmatterKey: "journal-index", anchorValue: 1, reset: { kind: "never" } }],
        }
      : { enabled: false, anchorDate: "", allowBefore: false, sources: [] },
    templates: [],
    confirmCreation: false,
    autoCreate: false,
    decorations: journal.decorations,
    navBlock: defaultNavBlocks[journal.write.type],
    intervalBlock: custom ? customIntervalBlock : emptyIntervalBlock,
  };
}

// --- period walking ---

const FIXED_UNITS = { day: "day", week: "week", month: "month", quarter: "quarter", year: "year" };

function customNext(anchor, write) {
  // Only day/week cadences are used here; both step cleanly without the month-phase rule
  // CycleService applies to month-sized steps.
  return anchor.clone().add(write.duration, write.every);
}

// Yields { anchor, start, end, representative, index } per period whose anchor falls in range.
function* periods(journal, rangeStart, rangeEnd) {
  if (isCustom(journal)) {
    let anchor = moment(journal.write.anchorDate, "YYYY-MM-DD", true);
    let index = 1;
    while (anchor.isSameOrBefore(rangeEnd)) {
      const next = customNext(anchor, journal.write);
      if (anchor.isSameOrAfter(rangeStart)) {
        yield {
          anchor: anchor.clone(),
          start: anchor.clone(),
          end: next.clone().subtract(1, "day"),
          representative: anchor.clone(),
          index,
        };
      }
      anchor = next;
      index++;
    }
    return;
  }

  const unit = FIXED_UNITS[journal.write.type];
  let anchor = rangeStart.clone().startOf(unit);
  if (anchor.isBefore(rangeStart)) anchor = anchor.add(1, unit);
  while (anchor.isSameOrBefore(rangeEnd)) {
    const end = anchor.clone().endOf(unit).startOf("day");
    // A week's representative is the day whose calendar year is the week-year, matching
    // WeekPeriod — otherwise a week straddling January 1 formats {{date:YYYY}} to the wrong year.
    const representative = unit === "week" ? anchor.clone().add(WEEK.doy - 1, "day") : anchor.clone();
    yield { anchor: anchor.clone(), start: anchor.clone(), end, representative };
    anchor = anchor.clone().add(1, unit);
  }
}

// --- rendering ---

function renderTemplate(template, context) {
  return template.replaceAll(/\{\{(\w+)(?::([^}]+))?\}\}/g, (_match, name, format) => {
    const value = context.vars[name];
    if (value === undefined) return "";
    if (moment.isMoment(value)) return value.format(format ?? context.dateFormat);
    return String(value);
  });
}

function contextFor(journal, period) {
  return {
    dateFormat: journal.dateFormat,
    vars: {
      date: period.representative,
      start_date: period.start,
      end_date: period.end,
      journal_name: journal.name,
      ...(period.index !== undefined && { index: period.index }),
    },
  };
}

function hashOf(text) {
  let hash = 2166136261;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return Math.abs(hash);
}

function frontmatterFor(journal, period, hash) {
  const lines = [`journal: ${journal.name}`, `journal-date: ${period.anchor.format("YYYY-MM-DD")}`];
  if (isCustom(journal)) {
    lines.push(`journal-start-date: ${period.start.format("YYYY-MM-DD")}`);
    lines.push(`journal-end-date: ${period.end.format("YYYY-MM-DD")}`);
    lines.push(`journal-index: ${period.index}`);
  }
  if (hash % 5 === 0) lines.push("mood: good");
  else if (hash % 5 === 1) lines.push("mood: flat");
  if (hash % 13 === 0) lines.push("holiday: true");
  return lines;
}

const FENCE = "```";

function bodyFor(journal, period, noteName, hash) {
  const lines = [`---`, ...frontmatterFor(journal, period, hash), `---`, ""];
  lines.push(`# ${noteName}`, "");
  lines.push(`${FENCE}journal-nav`, FENCE, "");

  const taskVariant = hash % 6;
  if (taskVariant < 4) {
    lines.push("## Tasks", "");
    lines.push("- [x] Review inbox");
    lines.push("- [x] Clear notifications");
    if (taskVariant >= 2) lines.push("- [ ] Plan the next block", "- [ ] Write the summary");
    lines.push("");
  }

  lines.push("## Log", "");
  lines.push(`Entry for ${period.start.format("dddd, D MMMM YYYY")}.`);
  if (journal.write.type === "day") {
    lines.push(`Rolls up into [[${period.anchor.format("YYYY-MM")}]].`);
  } else if (isCustom(journal)) {
    lines.push(`Covers ${period.start.format("YYYY-MM-DD")} through ${period.end.format("YYYY-MM-DD")}.`);
  }
  if (hash % 3 === 0) lines.push("", "Tagged #focus for the week.");
  if (hash % 7 === 0) lines.push("", "> A quote worth keeping around.");
  lines.push("");
  return lines.join("\n");
}

// --- vault scaffolding ---

async function writeVaultConfig(outDir) {
  const configDir = path.join(outDir, ".obsidian");
  await mkdir(path.join(configDir, "plugins"), { recursive: true });

  await writeFile(path.join(configDir, "app.json"), JSON.stringify({ promptDelete: false }, null, 2));
  await writeFile(path.join(configDir, "appearance.json"), JSON.stringify({}, null, 2));
  await cp(path.join(repoRoot, "test-vault/.obsidian/core-plugins.json"), path.join(configDir, "core-plugins.json"));
  await writeFile(path.join(configDir, "community-plugins.json"), JSON.stringify(["hot-reload", "journals"], null, 2));
  await cp(path.join(repoRoot, "test-vault/.obsidian/plugins/hot-reload"), path.join(configDir, "plugins/hot-reload"), {
    recursive: true,
  });

  // Per-file symlinks, not a symlinked plugin directory: data.json must stay this vault's own
  // file or the two vaults would overwrite each other's settings.
  const pluginDir = path.join(configDir, "plugins/journals");
  await mkdir(pluginDir, { recursive: true });
  await writeFile(path.join(pluginDir, ".hotreload"), "");
  for (const file of ["main.js", "manifest.json", "styles.css"]) {
    await rm(path.join(pluginDir, file), { force: true });
    await symlink(path.join("../../../../test-vault/.obsidian/plugins/journals", file), path.join(pluginDir, file));
  }
  return pluginDir;
}

function buildSettings() {
  return {
    version: SETTINGS_VERSION,
    calendar: { mode: "custom", dow: WEEK.dow, doy: WEEK.doy, global: false },
    calendarDisplay: { weekPlacement: "left" },
    decorations: { decorations: vaultDecorations },
    journals: Object.fromEntries(journals.map((journal) => [journal.name, journalConfig(journal)])),
    shelves,
  };
}

const HOME_NOTE = [
  "# Performance vault",
  "",
  `${FENCE}journals-home`,
  "show:",
  "\t- day",
  "\t- week",
  "\t- month",
  "\t- quarter",
  "\t- year",
  "\t- custom",
  "scale: 2",
  FENCE,
  "",
  `${FENCE}calendar-timeline`,
  "mode: year",
  FENCE,
  "",
].join("\n");

async function generateNotes(outDir, rangeStart, rangeEnd) {
  const counts = {};
  for (const journal of journals) {
    const writes = [];
    for (const period of periods(journal, rangeStart, rangeEnd)) {
      const context = contextFor(journal, period);
      const noteName = renderTemplate(nameTemplateOf(journal), context);
      const folder = renderTemplate(journal.folder, { ...context, vars: { ...context.vars, note_name: noteName } });
      const relativePath = folder ? `${folder}/${noteName}.md` : `${noteName}.md`;
      const hash = hashOf(relativePath);
      writes.push({ relativePath, body: bodyFor(journal, period, noteName, hash) });
    }
    const folders = new Set(writes.map((write) => path.dirname(path.join(outDir, write.relativePath))));
    for (const folder of folders) await mkdir(folder, { recursive: true });
    await Promise.all(writes.map((write) => writeFile(path.join(outDir, write.relativePath), write.body)));
    counts[journal.name] = writes.length;
  }
  return counts;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const outDir = path.resolve(repoRoot, args.out);
  const rangeStart = moment(args.start, "YYYY-MM-DD", true);
  const rangeEnd = rangeStart.clone().add(args.years, "year").subtract(1, "day");

  if (args.clean) await rm(outDir, { recursive: true, force: true });
  for (const root of new Set(journals.map((journal) => journal.folder.split("/")[0]))) {
    await rm(path.join(outDir, root), { recursive: true, force: true });
  }
  await mkdir(outDir, { recursive: true });

  const pluginDir = await writeVaultConfig(outDir);
  await writeFile(path.join(pluginDir, "data.json"), JSON.stringify(buildSettings(), null, 2));
  await writeFile(path.join(outDir, "Home.md"), HOME_NOTE);

  const counts = await generateNotes(outDir, rangeStart, rangeEnd);
  const total = Object.values(counts).reduce((sum, count) => sum + count, 0);

  console.log(`vault:  ${outDir}`);
  console.log(`range:  ${rangeStart.format("YYYY-MM-DD")} .. ${rangeEnd.format("YYYY-MM-DD")} (${args.years}y)`);
  for (const journal of journals) {
    const shelf = journal.shelf ? `shelf:${journal.shelf}` : "off-shelf";
    console.log(`  ${journal.name.padEnd(16)} ${String(counts[journal.name]).padStart(5)}  ${shelf}`);
  }
  console.log(`total:  ${total} notes`);
}

await main();
