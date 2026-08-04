#!/usr/bin/env node
// Builds a v1 (pre-2.0) Journals config plus the notes that config would have produced, so the
// v1 -> v2 -> v3 -> v4 migration chain can be driven end to end in a real vault. Writes into
// test-vault by default, where `npm run dev` already deploys the plugin; opening the vault after
// running this triggers the migration on load.
//
//   node scripts/generate-v1-vault.mjs [--out DIR] [--force] [--keep-notes]
//
// data.json is only overwritten with --force, so an in-progress dev config is never clobbered.

import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import moment from "moment";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// v1 stored firstDayOfWeek/firstWeekOfYear; the migration derives doy = 7 + dow - fwoy, so
// 1/4 is ISO. Pinning the same grid here is what makes the generated week anchors and
// {{date:[W]ww}} filenames agree with what the migrated journals compute.
const V1_WEEK = { firstDayOfWeek: 1, firstWeekOfYear: 4 };
moment.locale("en");
moment.updateLocale("en", {
  week: { dow: V1_WEEK.firstDayOfWeek, doy: 7 + V1_WEEK.firstDayOfWeek - V1_WEEK.firstWeekOfYear },
});

// --- v1 settings ---

const ribbon = (over = {}) => ({ show: false, icon: "", tooltip: "", ...over });

const section = (over = {}) => ({
  enabled: false,
  openMode: "active",
  nameTemplate: "",
  dateFormat: "",
  folder: "",
  template: "",
  ribbon: ribbon(),
  createOnStartup: false,
  ...over,
});

const interval = (over) => ({
  type: "interval",
  duration: 1,
  granularity: "week",
  start_date: "",
  start_index: 1,
  numeration_type: "increment",
  end_type: "never",
  end_date: "",
  repeats: 1,
  limitCreation: false,
  createOnStartup: false,
  openOnStartup: false,
  openMode: "active",
  nameTemplate: "",
  navNameTemplate: "",
  navDatesTemplate: "",
  dateFormat: "",
  folder: "",
  template: "",
  ribbon: ribbon(),
  calendar_view: { order: "chrono" },
  ...over,
});

// "Personal" exercises the full calendar fan-out: five enabled sections become five journals on a
// "Personal" shelf, with a rootFolder prefix, per-section formats, a ribbon and a template.
const personal = {
  id: "personal",
  type: "calendar",
  name: "Personal",
  rootFolder: "Personal",
  openOnStartup: true,
  startupSection: "day",
  day: section({
    enabled: true,
    folder: "Daily",
    dateFormat: "YYYY-MM-DD",
    template: "templates/daily template.md",
    ribbon: ribbon({ show: true, icon: "calendar-days", tooltip: "Open today's note" }),
    createOnStartup: true,
  }),
  week: section({
    enabled: true,
    folder: "Weekly",
    dateFormat: "YYYY-[W]ww",
    template: "templates/weekly daily links.md",
  }),
  month: section({ enabled: true, folder: "Monthly", dateFormat: "YYYY-MM" }),
  quarter: section({ enabled: true, folder: "Quarterly", dateFormat: "YYYY-[Q]Q" }),
  year: section({ enabled: true, folder: "Yearly", dateFormat: "YYYY" }),
};

// "Work" only enables two sections, so its shelf gets two journals — and the week/quarter notes
// below have no journal to land in, which is the orphan-frontmatter path of the note migration.
// It also has no rootFolder and a non-default nameTemplate/openMode.
const work = {
  id: "work",
  type: "calendar",
  name: "Work",
  rootFolder: "",
  openOnStartup: false,
  startupSection: "day",
  day: section({
    enabled: true,
    folder: "Work/Days",
    dateFormat: "DD.MM.YYYY",
    nameTemplate: "{{date}} standup",
    openMode: "split",
    ribbon: ribbon({ show: true, icon: "briefcase", tooltip: "Open today's standup" }),
  }),
  week: section({ enabled: false }),
  month: section({ enabled: true, folder: "Work/Months", dateFormat: "MMMM YYYY" }),
  quarter: section({ enabled: false }),
  year: section({ enabled: false }),
};

// The three intervals cover every end type (never / repeats / date) and both numeration types
// (increment / year, the latter migrating to a reset-after source).
const sprints = interval({
  id: "sprints",
  name: "Sprints",
  duration: 2,
  granularity: "week",
  start_date: "2024-01-01",
  start_index: 1,
  numeration_type: "increment",
  end_type: "never",
  folder: "Work/Sprints",
  navNameTemplate: "Sprint {{index}}",
  navDatesTemplate: "{{start_date}}|→|{{end_date}}",
  ribbon: ribbon({ show: true, icon: "calendar-range", tooltip: "Open current sprint" }),
});

const semesters = interval({
  id: "semesters",
  name: "Semesters",
  duration: 6,
  granularity: "month",
  start_date: "2024-01-01",
  start_index: 1,
  numeration_type: "year",
  end_type: "repeats",
  repeats: 6,
  nameTemplate: "{{date:YYYY}}-H{{index}}",
  dateFormat: "YYYY-MM",
  folder: "Personal/Semesters",
});

const reading = interval({
  id: "reading",
  name: "Reading Cycles",
  duration: 10,
  granularity: "day",
  start_date: "2024-01-01",
  start_index: 1,
  numeration_type: "increment",
  end_type: "date",
  end_date: "2024-06-30",
  limitCreation: true,
  folder: "Personal/Reading",
});

const v1Settings = {
  journals: {
    [personal.id]: personal,
    [work.id]: work,
    [sprints.id]: sprints,
    [semesters.id]: semesters,
    [reading.id]: reading,
  },
  calendar: V1_WEEK,
  calendar_view: { leaf: "left", weeks: "left" },
};

// Every folder these journals write into; wiped before regenerating so re-runs stay idempotent.
const GENERATED_ROOTS = ["Personal", "Work", "Legacy"];

// --- what to generate ---

const DEFAULT_FORMATS = { day: "YYYY-MM-DD", week: "YYYY-[W]w", month: "YYYY-MM", quarter: "YYYY-[Q]Q", year: "YYYY" };

// Gaps are deliberate: a vault where every period has a note can't show the difference between
// "has note" and "no note" decorations, or the create-vs-open branch of navigation.
const plans = [
  { journal: personal, kind: "day", from: "2024-01-01", to: "2024-02-10", keep: (i) => i % 3 !== 2 },
  // Every 5th week note is anchored on the week's *last* day instead of its first — the shape v2
  // wrote for a week it numbered as week 1 of the next year. The note migration has to
  // re-canonicalize these onto the week's Monday.
  { journal: personal, kind: "week", from: "2024-01-01", to: "2024-03-31", misanchorEvery: 5 },
  { journal: personal, kind: "month", from: "2023-09-01", to: "2024-04-30" },
  { journal: personal, kind: "quarter", from: "2023-07-01", to: "2024-06-30" },
  { journal: personal, kind: "year", from: "2023-01-01", to: "2024-12-31" },
  { journal: work, kind: "day", from: "2024-01-08", to: "2024-01-26", keep: (i) => i % 7 < 5 },
  { journal: work, kind: "month", from: "2023-12-01", to: "2024-04-30" },
  { journal: sprints, kind: "custom", limit: 10 },
  { journal: semesters, kind: "custom", limit: 6 },
  { journal: reading, kind: "custom", limit: 8 },
];

// Notes the migration must handle without a journal to move them into.
const looseNotes = [
  {
    relativePath: "Work/Weeks/2024-W03.md",
    frontmatter: ["journal: work", "journal-section: week", "journal-start-date: 2024-01-15"],
    body: "Week note from before the week section was turned off. Its journal keys should be stripped.",
  },
  {
    relativePath: "Work/Weeks/2024-W04.md",
    frontmatter: ["journal: work", "journal-section: week", "journal-start-date: 2024-01-22"],
    body: "Second orphaned week note.",
  },
  {
    relativePath: "Legacy/2023-Q4 review.md",
    frontmatter: ["journal: work", "journal-section: quarter", "journal-start-date: 2023-10-01"],
    body: "Quarter note for a section that was never enabled.",
  },
  {
    relativePath: "Legacy/broken date.md",
    frontmatter: ["journal: personal", "journal-section: day", "journal-start-date: not-a-date"],
    body: "Unparseable start date — the journal keys should be dropped rather than migrated.",
  },
  {
    relativePath: "Legacy/deleted journal.md",
    frontmatter: ["journal: gratitude", "journal-section: day", "journal-start-date: 2023-05-04"],
    body: "References a journal id that no longer exists in settings, so nothing claims it.",
  },
];

// --- period walking ---

function isInterval(journal) {
  return journal.type === "interval";
}

function nameTemplateOf(journal, kind) {
  if (kind === "custom") return journal.nameTemplate || "{{journal_name}} {{index}}";
  return journal[kind].nameTemplate || "{{date}}";
}

function dateFormatOf(journal, kind) {
  if (kind === "custom") return journal.dateFormat || "YYYY-MM-DD";
  return journal[kind].dateFormat || DEFAULT_FORMATS[kind];
}

function folderOf(journal, kind) {
  if (kind === "custom") return journal.folder;
  const sectionFolder = journal[kind].folder;
  return journal.rootFolder ? `${journal.rootFolder}/${sectionFolder}` : sectionFolder;
}

function resetAfterOf(journal) {
  if (journal.numeration_type !== "year") return 0;
  const per = { month: 12, week: 52, day: 365 }[journal.granularity];
  return Math.floor(per / journal.duration);
}

function* fixedPeriods(kind, from, to) {
  let anchor = from.clone().startOf(kind);
  if (anchor.isBefore(from)) anchor = anchor.add(1, kind);
  while (anchor.isSameOrBefore(to)) {
    const end = anchor.clone().endOf(kind).startOf("day");
    // A week's representative day is the one whose calendar year is the week-year, matching
    // WeekPeriod — without it a week straddling January 1 formats {{date:YYYY}} to the wrong year.
    const representative = kind === "week" ? anchor.clone().add(3, "day") : anchor.clone();
    yield { anchor: anchor.clone(), start: anchor.clone(), end, representative };
    anchor = anchor.clone().add(1, kind);
  }
}

function* customPeriods(journal, limit) {
  const resetAfter = resetAfterOf(journal);
  const endDate = journal.end_type === "date" ? moment(journal.end_date, "YYYY-MM-DD", true) : undefined;
  const maxPeriods = journal.end_type === "repeats" ? journal.repeats : Infinity;

  let anchor = moment(journal.start_date, "YYYY-MM-DD", true);
  for (let step = 0; step < Math.min(limit, maxPeriods); step++) {
    if (endDate && anchor.isAfter(endDate)) return;
    const next = anchor.clone().add(journal.duration, journal.granularity);
    const index = resetAfter > 0 ? (step % resetAfter) + journal.start_index : step + journal.start_index;
    yield {
      anchor: anchor.clone(),
      start: anchor.clone(),
      end: next.clone().subtract(1, "day"),
      representative: anchor.clone(),
      index,
    };
    anchor = next;
  }
}

function* periodsFor(plan) {
  if (plan.kind === "custom") {
    yield* customPeriods(plan.journal, plan.limit);
    return;
  }
  const from = moment(plan.from, "YYYY-MM-DD", true);
  const to = moment(plan.to, "YYYY-MM-DD", true);
  let i = 0;
  for (const period of fixedPeriods(plan.kind, from, to)) {
    const index = i++;
    if (plan.keep && !plan.keep(index)) continue;
    if (plan.limit !== undefined && index >= plan.limit) return;
    // The frontmatter date v1 stored; usually the period's first day, deliberately its last for
    // the mis-anchored weeks.
    const misanchored = plan.misanchorEvery !== undefined && index > 0 && index % plan.misanchorEvery === 0;
    yield { ...period, stored: misanchored ? period.end.clone() : period.start.clone() };
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

function hashOf(text) {
  let hash = 2166136261;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.codePointAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return Math.abs(hash);
}

function frontmatterFor(plan, period, hash) {
  const stored = (period.stored ?? period.start).format("YYYY-MM-DD");
  const lines =
    plan.kind === "custom"
      ? [
          `journal: ${plan.journal.id}`,
          `journal-start-date: ${stored}`,
          `journal-end-date: ${period.end.format("YYYY-MM-DD")}`,
          `journal-interval-index: ${period.index}`,
        ]
      : [`journal: ${plan.journal.id}`, `journal-section: ${plan.kind}`, `journal-start-date: ${stored}`];
  if (hash % 4 === 0) lines.push("mood: good");
  return lines;
}

const FENCE = "```";

function bodyFor(plan, period, noteName, hash) {
  const lines = ["---", ...frontmatterFor(plan, period, hash), "---", ""];
  lines.push(`# ${noteName}`, "");
  lines.push(`${FENCE}journal-nav`, FENCE, "");

  const taskVariant = hash % 6;
  if (taskVariant < 4) {
    lines.push("## Tasks", "", "- [x] Review inbox");
    if (taskVariant >= 2) lines.push("- [ ] Plan the next block");
    lines.push("");
  }

  lines.push("## Log", "", `Entry for ${period.start.format("dddd, D MMMM YYYY")}.`);
  if (plan.kind === "custom") {
    lines.push(`Covers ${period.start.format("YYYY-MM-DD")} through ${period.end.format("YYYY-MM-DD")}.`);
  }
  if (hash % 3 === 0) lines.push("", "Tagged #focus this time.");
  lines.push("");
  return lines.join("\n");
}

function notesFor(plan) {
  const folder = folderOf(plan.journal, plan.kind);
  const nameTemplate = nameTemplateOf(plan.journal, plan.kind);
  const dateFormat = dateFormatOf(plan.journal, plan.kind);
  const notes = [];

  for (const period of periodsFor(plan)) {
    const context = {
      dateFormat,
      vars: {
        date: period.representative,
        start_date: period.start,
        end_date: period.end,
        journal_name: plan.journal.name,
        ...(period.index !== undefined && { index: period.index }),
      },
    };
    // The path follows the period's true anchor even when the stored frontmatter date does not,
    // so a mis-anchored note still sits where the migrated journal will look for it.
    const noteName = renderTemplate(nameTemplate, context);
    const relativePath = folder ? `${folder}/${noteName}.md` : `${noteName}.md`;
    notes.push({ relativePath, body: bodyFor(plan, period, noteName, hashOf(relativePath)) });
  }
  return notes;
}

// --- writing ---

function parseArgs(argv) {
  const args = { out: "test-vault", force: false, keepNotes: false };
  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i];
    if (flag === "--force") args.force = true;
    else if (flag === "--keep-notes") args.keepNotes = true;
    else if (flag === "--out") args.out = argv[++i];
    else throw new Error(`unknown flag: ${flag}`);
  }
  return args;
}

async function writeNotes(outDir, notes) {
  const folders = new Set(notes.map((note) => path.dirname(path.join(outDir, note.relativePath))));
  for (const folder of folders) await mkdir(folder, { recursive: true });
  await Promise.all(notes.map((note) => writeFile(path.join(outDir, note.relativePath), note.body)));
}

async function dataJsonIsV1(dataPath) {
  try {
    const parsed = JSON.parse(await readFile(dataPath, "utf8"));
    return parsed.version === undefined;
  } catch {
    return true;
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const outDir = path.resolve(repoRoot, args.out);
  const pluginDir = path.join(outDir, ".obsidian/plugins/journals");
  const dataPath = path.join(pluginDir, "data.json");

  if (!args.force && !(await dataJsonIsV1(dataPath))) {
    throw new Error(
      `${dataPath} already holds a migrated config — re-run with --force to overwrite it with the v1 fixture`,
    );
  }

  if (!args.keepNotes) {
    for (const root of GENERATED_ROOTS) await rm(path.join(outDir, root), { recursive: true, force: true });
  }

  await mkdir(pluginDir, { recursive: true });
  await writeFile(dataPath, JSON.stringify(v1Settings, null, 2));

  let total = 0;
  const counts = [];
  for (const plan of plans) {
    const notes = notesFor(plan);
    await writeNotes(outDir, notes);
    counts.push([`${plan.journal.name} ${plan.kind}`, notes.length]);
    total += notes.length;
  }

  const loose = looseNotes.map((note) => ({
    relativePath: note.relativePath,
    body: ["---", ...note.frontmatter, "---", "", note.body, ""].join("\n"),
  }));
  await writeNotes(outDir, loose);
  counts.push(["unmigratable leftovers", loose.length]);
  total += loose.length;

  console.log(`vault:  ${outDir}`);
  console.log(`config: ${dataPath} (v1 shape, no version key)`);
  for (const [label, count] of counts) console.log(`  ${label.padEnd(26)} ${String(count).padStart(4)}`);
  console.log(`total:  ${total} notes`);
}

await main();
