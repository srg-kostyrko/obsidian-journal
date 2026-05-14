# v3 Calendar Settings Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Port v2's week-configuration settings (`settings.calendar = { dow, doy, global }` + preset-picker modal) to v3 as a slice, an eager bridge that pushes changes through `Calendar.applyWeekConfig`, a dashboard block, and a modal — all under `src/calendar/`.

**Architecture:** A discriminated `calendarSlice` (`mode: "locale" | "custom"`) lives in `src/calendar/settings/`. `Calendar` (in `src/calendar/calendar.ts`) gains an `applyWeekConfig(week, { global })` method and captures the boot locale's week. `CalendarSettingsBridge` is eager, `watchEffect`-subscribes to slice state, and calls `applyWeekConfig` — so `Calendar` never resolves settings (the contract from the v3 calendar spec). UI: `CalendarWeekBlock.vue` dashboard block + `WeekPresetPickerModal.vue` opened via `ModalService`. New paraglide messages cover all UI copy.

**Tech Stack:** TypeScript, Vue 3 (SFCs + `<script setup>`), valibot (slice schema), ts-pattern (variant dispatch), moment.js (locale mutation via `Calendar` only), Vitest + @testing-library/vue, paraglide (authored `messages/en.json`, compiled into `src/i18n/paraglide/` via the inlang plugin-message-format and `paraglideVitePlugin`).

**Spec:** `docs/superpowers/specs/2026-05-14-v3-calendar-settings-design.md`

---

## File map

**Create:**

- `messages/en.json` — paraglide source (Task 0 creates the file; Task 4 adds calendar keys)
- `project.inlang/settings.json` — inlang plugin config (Task 0)
- `project.inlang/project_id` — inlang generated marker (Task 0)
- `src/calendar/presets.ts` — `WeekPreset` type, `weekPresets` array, `detectCurrentPreset`
- `src/calendar/presets.test.ts`
- `src/calendar/settings/slice.ts` — `calendarSlice`, `calendarSliceSchema`, `CalendarSliceState`
- `src/calendar/settings/slice.test.ts` — schema parse/check tests
- `src/calendar/settings/bridge.ts` — `CalendarSettingsBridge`
- `src/calendar/settings/bridge.test.ts`
- `src/calendar/settings/module.ts` — `calendarSettingsModule`
- `src/calendar/settings/ui/CalendarWeekBlock.vue`
- `src/calendar/settings/ui/CalendarWeekBlock.test.ts`
- `src/calendar/settings/ui/WeekPresetPickerModal.vue`
- `src/calendar/settings/ui/WeekPresetPickerModal.test.ts`
- `src/calendar/settings/ui/week-preset-picker-modal.ts` — `defineModal` definition

**Modify:**

- `package.json` — add `@inlang/paraglide-js` dep (Task 0)
- `vite.config.mts` — wire `paraglideVitePlugin({ project: "./project.inlang", outdir: "./src/i18n/paraglide" })` (Task 0)
- `src/calendar/calendar.ts` — add `applyWeekConfig`, capture boot locale, drop `WeekConfig` constructor arg
- `src/calendar/calendar.test.ts` — covers `applyWeekConfig` paths (currently missing; add)
- `src/calendar/testing.ts` — update `installTestCalendar` for new no-arg `Calendar()`
- `src/calendar/index.ts` — re-export `weekPresets`, `detectCurrentPreset`, `WeekPreset`, `calendarSlice`, `CalendarSliceState`, `calendarSettingsModule`
- `src/main.ts` — `container.addModule(calendarSettingsModule)` after `settingsModule` and `CalendarModule`

**Generated (gitignored, not edited by hand):**

- `src/i18n/paraglide/**/*.js` — paraglide-emitted output. The `src/i18n/paraglide/.gitignore` already excludes everything in this directory; the vite plugin from Task 0 regenerates these files on every build (and they need to be regenerated for tests to pick up new keys — see Task 4 Step 4).

---

## Task 0: i18n source scaffolding (prereq)

**Background.** The currently committed `src/i18n/init-locale.ts` + `@/i18n` barrel were wired in commit `58cbb714`, but the paraglide _source_ (`messages/en.json`) + inlang config + vite plugin were never brought to `v3-ai`. They exist on `v3-dev-ai`. Without them, paraglide's vite plugin doesn't run, no `m.*` functions exist, and the `src/i18n/paraglide/messages/*.js` files seen on disk are stale artifacts from an earlier setup (and gitignored). This task brings the minimum scaffolding needed so Task 4 can author messages as data.

**Note.** This task introduces paraglide's compiler. The `src/i18n/paraglide/` directory will be regenerated on every build/test run from `messages/en.json`. Existing untracked `.js` files in that directory will be replaced; that's expected and harmless.

**Files:**

- Create: `messages/en.json`
- Create: `project.inlang/settings.json`
- Modify: `package.json`
- Modify: `vite.config.mts`

- [ ] **Step 1: Install the paraglide dependency**

```bash
npm install --save @inlang/paraglide-js@^2.15.2
```

Also add a compile script to `package.json` under `"scripts"` (a one-shot compile is needed before `npm test` because vitest doesn't run vite plugins):

```diff
   "scripts": {
     "dev": "vite build --watch",
     "build": "vite build",
+    "compile:i18n": "paraglide-js compile --project ./project.inlang",
     "version": "node version-bump.mjs && git add manifest.json manifest-beta.json versions.json",
     "check:lint": "eslint .",
     "test": "vitest run",
```

- [ ] **Step 2: Create `project.inlang/settings.json`**

```json
{
  "baseLocale": "en",
  "locales": ["en"],
  "modules": ["https://cdn.jsdelivr.net/npm/@inlang/plugin-message-format@latest/dist/index.js"],
  "plugin.inlang.messageFormat": {
    "pathPattern": "./messages/{locale}.json"
  }
}
```

The pre-existing `project.inlang/.gitignore` already keeps everything except `settings.json` tracked, so nothing else under that directory needs git attention.

- [ ] **Step 3: Create the minimal `messages/en.json`**

```json
{
  "$schema": "https://inlang.com/schema/inlang-message-format"
}
```

Task 4 will add the calendar keys. Other parts of the codebase that need i18n will add their own keys in their own work; we deliberately do NOT bulk-import v3-dev-ai's full en.json (out of scope — most of those keys reference v3-dev-ai-only features).

- [ ] **Step 4: Wire `paraglideVitePlugin` in `vite.config.mts`**

```ts
// vite.config.mts (top of file, additional imports)
import { paraglideVitePlugin } from "@inlang/paraglide-js";

// inside plugins: [ ... ]
plugins: [
  paraglideVitePlugin({
    project: "./project.inlang",
    outdir: "./src/i18n/paraglide",
  }),
  vue(),
  viteStaticCopy({ /* unchanged */ }),
],
```

`outdir` must be `./src/i18n/paraglide` (not `./src/paraglide`) so the existing `@/i18n` barrel at `src/i18n/index.ts` (which does `export { m } from "./paraglide/messages.js"`) keeps resolving.

- [ ] **Step 5: Run the compiler once and verify the output**

```bash
npm run compile:i18n
ls src/i18n/paraglide/
```

Expected: `messages.js`, `runtime.js`, plus a `messages/` subdirectory. The empty `messages/en.json` produces a barebones output — there are no message functions yet, just the runtime bootstrap.

- [ ] **Step 6: Verify the existing imports still resolve**

```bash
npm run check:types
npm test
```

Expected: both pass. `src/main.ts` imports `initLocale` from `@/i18n`; `src/i18n/index.ts` re-exports `m` from `./paraglide/messages.js` (now regenerated). Existing tests should be unaffected.

- [ ] **Step 7: Commit**

```bash
git add messages/en.json project.inlang/settings.json package.json package-lock.json vite.config.mts
git commit -m "feat(i18n): wire paraglide compiler and minimal messages source"
```

---

## Task 1: Presets

**Files:**

- Create: `src/calendar/presets.ts`
- Test: `src/calendar/presets.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
// src/calendar/presets.test.ts
import { describe, expect, it } from "vitest";

import { detectCurrentPreset, weekPresets } from "./presets";

describe("detectCurrentPreset", () => {
  it("returns the ISO 8601 preset for dow=1, doy=4", () => {
    const result = detectCurrentPreset({ dow: 1, doy: 4 });
    expect(result).not.toBe("custom");
    if (result === "custom") return;
    expect(result.id).toBe("iso-8601");
  });

  it("returns the Western preset for dow=0, doy=6", () => {
    const result = detectCurrentPreset({ dow: 0, doy: 6 });
    expect(result).not.toBe("custom");
    if (result === "custom") return;
    expect(result.id).toBe("western");
  });

  it("returns the Middle Eastern preset for dow=6, doy=12", () => {
    const result = detectCurrentPreset({ dow: 6, doy: 12 });
    expect(result).not.toBe("custom");
    if (result === "custom") return;
    expect(result.id).toBe("middle-eastern");
  });

  it('returns "custom" for a valid combination not in the preset list', () => {
    // dow=3 (Wed start), doy=7 → first day of Jan in week 1 = 7 + 3 - 7 = 3
    const result = detectCurrentPreset({ dow: 3, doy: 7 });
    expect(result).toBe("custom");
  });
});

describe("weekPresets", () => {
  it("exposes exactly the three v2 presets", () => {
    expect(weekPresets.map((p) => p.id)).toEqual(["iso-8601", "western", "middle-eastern"]);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- --run src/calendar/presets.test.ts`
Expected: FAIL — cannot resolve `./presets`.

- [ ] **Step 3: Write the minimal implementation**

```ts
// src/calendar/presets.ts
export interface WeekPreset {
  readonly id: "iso-8601" | "western" | "middle-eastern";
  readonly dow: number;
  readonly doy: number;
}

export const weekPresets: readonly WeekPreset[] = [
  { id: "iso-8601", dow: 1, doy: 4 },
  { id: "western", dow: 0, doy: 6 },
  { id: "middle-eastern", dow: 6, doy: 12 },
];

export function detectCurrentPreset(week: { dow: number; doy: number }): WeekPreset | "custom" {
  return weekPresets.find((p) => p.dow === week.dow && p.doy === week.doy) ?? "custom";
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- --run src/calendar/presets.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/calendar/presets.ts src/calendar/presets.test.ts
git commit -m "feat(calendar): add week-preset data and detection"
```

---

## Task 2: Calendar boot-locale capture + `applyWeekConfig`

**Files:**

- Modify: `src/calendar/calendar.ts`
- Modify: `src/calendar/testing.ts`
- Create: `src/calendar/calendar.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
// src/calendar/calendar.test.ts
import { moment } from "obsidian";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { Calendar, CUSTOM_LOCALE } from "./calendar";

function customWeek(): { dow: number; doy: number } {
  const data = moment.localeData(CUSTOM_LOCALE);
  return { dow: data.firstDayOfWeek(), doy: data.firstDayOfYear() };
}

function globalWeek(): { dow: number; doy: number } {
  const data = moment.localeData();
  return { dow: data.firstDayOfWeek(), doy: data.firstDayOfYear() };
}

describe("Calendar", () => {
  let priorGlobal: { dow: number; doy: number };
  let priorLocale: string;

  beforeEach(() => {
    priorLocale = moment.locale();
    priorGlobal = globalWeek();
  });

  afterEach(() => {
    // restore the global locale's week so tests don't leak state
    moment.updateLocale(priorLocale, { week: priorGlobal });
    moment.locale(priorLocale);
  });

  describe("applyWeekConfig", () => {
    it("sets the custom locale week when given an explicit config", () => {
      const calendar = new Calendar();
      calendar.applyWeekConfig({ dow: 0, doy: 6 }, { global: false });
      expect(customWeek()).toEqual({ dow: 0, doy: 6 });
    });

    it("leaves the global locale week alone when global=false", () => {
      const calendar = new Calendar();
      calendar.applyWeekConfig({ dow: 0, doy: 6 }, { global: false });
      expect(globalWeek()).toEqual(priorGlobal);
    });

    it("updates the global locale week when global=true", () => {
      const calendar = new Calendar();
      calendar.applyWeekConfig({ dow: 0, doy: 6 }, { global: true });
      expect(globalWeek()).toEqual({ dow: 0, doy: 6 });
    });

    it('restores the captured initial week onto the custom locale when given "locale"', () => {
      const calendar = new Calendar();
      calendar.applyWeekConfig({ dow: 0, doy: 6 }, { global: false });
      calendar.applyWeekConfig("locale", { global: false });
      expect(customWeek()).toEqual(priorGlobal);
    });

    it("restores the captured initial week onto the global locale after a global=true push", () => {
      const calendar = new Calendar();
      calendar.applyWeekConfig({ dow: 0, doy: 6 }, { global: true });
      calendar.applyWeekConfig("locale", { global: false });
      expect(globalWeek()).toEqual(priorGlobal);
    });
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- --run src/calendar/calendar.test.ts`
Expected: FAIL — `Calendar` constructor still expects a `WeekConfig` arg and `applyWeekConfig` doesn't exist.

- [ ] **Step 3: Rewrite `src/calendar/calendar.ts`**

```ts
// src/calendar/calendar.ts
import { moment } from "obsidian";

export const CUSTOM_LOCALE = "custom-journal-locale";

export interface WeekConfig {
  readonly dow: number;
  readonly doy: number;
}

type MomentConstructor = (
  input?: string | number | Date | moment.Moment | null,
  format?: string,
  strict?: boolean,
) => moment.Moment;

export class Calendar {
  readonly #initial: WeekConfig;
  readonly #globalLocale: string;

  constructor() {
    const systemLocale = moment.locale();
    this.#globalLocale = systemLocale;

    const data = moment.localeData();
    this.#initial = { dow: data.firstDayOfWeek(), doy: data.firstDayOfYear() };

    if (!moment.locales().includes(CUSTOM_LOCALE)) {
      const sourceConfig = (data as unknown as { _config: moment.LocaleSpecification })._config;
      moment.defineLocale(CUSTOM_LOCALE, sourceConfig);
    }
    moment.updateLocale(CUSTOM_LOCALE, { week: this.#initial });
    moment.locale(systemLocale);
  }

  applyWeekConfig(week: WeekConfig | "locale", opts: { global: boolean }): void {
    const effective = week === "locale" ? this.#initial : week;
    const currentLocale = moment.locale();

    moment.updateLocale(CUSTOM_LOCALE, { week: effective });
    moment.locale(currentLocale);

    if (opts.global && week !== "locale") {
      moment.updateLocale(this.#globalLocale, { week: effective });
    } else {
      moment.updateLocale(this.#globalLocale, { week: this.#initial });
    }
  }
}

export function localMoment(
  input?: string | number | Date | moment.Moment | null,
  format?: string,
  strict?: boolean,
): moment.Moment {
  const m = moment as unknown as MomentConstructor;
  const instance = m(input, format, strict);
  return instance.locale(CUSTOM_LOCALE);
}
```

- [ ] **Step 4: Update `src/calendar/testing.ts` for the new no-arg `Calendar`**

Replace the existing `installTestCalendar` body so it constructs `Calendar()` then pushes the requested week via `applyWeekConfig`:

```ts
// src/calendar/testing.ts
import { moment } from "obsidian";

import { Calendar, type WeekConfig } from "./calendar";
import { CalendarDate } from "./calendar-date";

import type { AnchorString } from "./types";

export function installTestCalendar(week?: Partial<WeekConfig>): { teardown: () => void } {
  const priorLocale = moment.locale();
  const calendar = new Calendar();
  calendar.applyWeekConfig({ dow: week?.dow ?? 1, doy: week?.doy ?? 4 }, { global: false });

  return {
    teardown: () => {
      moment.locale(priorLocale);
    },
  };
}

export function anchor(s: string): AnchorString {
  return s as AnchorString;
}

export function date(s: string): CalendarDate {
  const result = CalendarDate.parse(s);
  if (result.kind === "err") {
    throw new Error(`fixture date(${JSON.stringify(s)}) failed to parse: ${result.error.message}`);
  }
  return result.value;
}
```

- [ ] **Step 5: Run tests across the calendar module to verify green**

Run: `npm test -- --run src/calendar/`
Expected: PASS for `calendar.test.ts` AND every existing calendar test (`calendar-date.test.ts`, `period-*.test.ts`, etc. — these all use `installTestCalendar`).

- [ ] **Step 6: Run the full quality gates**

```bash
npm test
npm run check:types
npm run check:lint
```

Expected: all tests pass, type-check clean, lint clean (existing 2 obsidianmd warnings tolerated; no new errors).

- [ ] **Step 7: Commit**

```bash
git add src/calendar/calendar.ts src/calendar/calendar.test.ts src/calendar/testing.ts
git commit -m "feat(calendar): capture boot locale and add applyWeekConfig"
```

---

## Task 3: Calendar settings slice

**Files:**

- Create: `src/calendar/settings/slice.ts`
- Test: `src/calendar/settings/slice.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
// src/calendar/settings/slice.test.ts
import { describe, expect, it } from "vitest";
import * as v from "valibot";

import { calendarSlice, calendarSliceSchema } from "./slice";

describe("calendarSliceSchema", () => {
  it("accepts the locale mode", () => {
    const parsed = v.safeParse(calendarSliceSchema, { mode: "locale" });
    expect(parsed.success).toBe(true);
  });

  it("accepts a valid custom mode", () => {
    const parsed = v.safeParse(calendarSliceSchema, {
      mode: "custom",
      dow: 1,
      doy: 4,
      global: false,
    });
    expect(parsed.success).toBe(true);
  });

  it("accepts the Middle Eastern preset's doy=12 with dow=6", () => {
    const parsed = v.safeParse(calendarSliceSchema, {
      mode: "custom",
      dow: 6,
      doy: 12,
      global: false,
    });
    expect(parsed.success).toBe(true);
  });

  it("rejects a custom mode where 7 + dow - doy is out of 1..7", () => {
    const parsed = v.safeParse(calendarSliceSchema, {
      mode: "custom",
      dow: 0,
      doy: 99,
      global: false,
    });
    expect(parsed.success).toBe(false);
  });

  it("rejects dow outside 0..6", () => {
    const parsed = v.safeParse(calendarSliceSchema, {
      mode: "custom",
      dow: 7,
      doy: 4,
      global: false,
    });
    expect(parsed.success).toBe(false);
  });
});

describe("calendarSlice", () => {
  it("defaults to locale mode", () => {
    expect(calendarSlice.defaults).toEqual({ mode: "locale" });
  });

  it('registers under the "calendar" key', () => {
    expect(calendarSlice.key).toBe("calendar");
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- --run src/calendar/settings/slice.test.ts`
Expected: FAIL — `./slice` does not resolve.

- [ ] **Step 3: Write the slice**

```ts
// src/calendar/settings/slice.ts
import * as v from "valibot";

import { defineSlice } from "@/settings";

const localeMode = v.object({ mode: v.literal("locale") });

const customMode = v.pipe(
  v.object({
    mode: v.literal("custom"),
    dow: v.pipe(v.number(), v.integer(), v.minValue(0), v.maxValue(6)),
    doy: v.pipe(v.number(), v.integer()),
    global: v.boolean(),
  }),
  v.check((s) => {
    const firstDayInJan = 7 + s.dow - s.doy;
    return firstDayInJan >= 1 && firstDayInJan <= 7;
  }, "doy must satisfy 1 ≤ 7 + dow - doy ≤ 7"),
);

export const calendarSliceSchema = v.variant("mode", [localeMode, customMode]);

export type CalendarSliceState = v.InferOutput<typeof calendarSliceSchema>;

export const calendarSlice = defineSlice<"calendar", typeof calendarSliceSchema>("calendar", calendarSliceSchema, {
  mode: "locale",
});
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- --run src/calendar/settings/slice.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add src/calendar/settings/slice.ts src/calendar/settings/slice.test.ts
git commit -m "feat(calendar): add calendar settings slice"
```

---

## Task 4: Calendar settings i18n messages

**Background.** Per Task 0, `messages/en.json` is the authored source; paraglide compiles it to `src/i18n/paraglide/messages/*.js`. To author UI copy, add keys to the JSON file and run `npm run compile:i18n`. Call sites then use `m.<snake_case_key>()` from `@/i18n`.

**Files:**

- Modify: `messages/en.json`

**Keys to add** (all are plain strings, no inputs):

| Key                                          | English output                                                                                                                                                  |
| -------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `calendar_week_config_title`                 | `Week configuration`                                                                                                                                            |
| `calendar_week_config_change`                | `Change`                                                                                                                                                        |
| `calendar_apply_globally_title`              | `Apply week configuration to all dates in vault?`                                                                                                               |
| `calendar_apply_globally_desc`               | `If disabled, week-configuration settings apply only to dates inside journals and do not affect dates created by other plugins or Obsidian itself.`             |
| `calendar_apply_globally_restart_hint`       | `You might need to restart Obsidian for changes to take effect.`                                                                                                |
| `calendar_preset_picker_title`               | `Week configuration`                                                                                                                                            |
| `calendar_preset_locale_name`                | `Follow system locale`                                                                                                                                          |
| `calendar_preset_locale_description`         | `Use the week settings defined by Obsidian's current locale.`                                                                                                   |
| `calendar_preset_iso_name`                   | `ISO 8601`                                                                                                                                                      |
| `calendar_preset_iso_description`            | `Week starts on Monday. First week of year includes the first Thursday (Jan 4th).`                                                                              |
| `calendar_preset_iso_used`                   | `EU (excluding Portugal) and most other European countries, most of Asia and Oceania.`                                                                          |
| `calendar_preset_western_name`               | `Western traditional`                                                                                                                                           |
| `calendar_preset_western_description`        | `Week starts on Sunday. First week of year includes the first Saturday (Jan 1st).`                                                                              |
| `calendar_preset_western_used`               | `Canada, United States, Iceland, Portugal, Japan, Taiwan, Thailand, Hong Kong, Macau, Israel, Egypt, South Africa, the Philippines, and most of Latin America.` |
| `calendar_preset_middle_eastern_name`        | `Middle Eastern`                                                                                                                                                |
| `calendar_preset_middle_eastern_description` | `Week starts on Saturday. First week of year includes the first Friday (Jan 1st).`                                                                              |
| `calendar_preset_middle_eastern_used`        | `Much of the Middle East.`                                                                                                                                      |
| `calendar_preset_custom_name`                | `Custom`                                                                                                                                                        |
| `calendar_preset_custom_description`         | `Define what day of week to treat as first and how the first week of year is determined.`                                                                       |
| `calendar_picker_use_action`                 | `Use`                                                                                                                                                           |
| `calendar_picker_in_use_marker`              | `Currently used`                                                                                                                                                |
| `calendar_picker_start_week_on`              | `Start week on`                                                                                                                                                 |
| `calendar_picker_start_week_on_desc`         | `Which day to treat as the first day of the week.`                                                                                                              |
| `calendar_picker_first_week_label`           | `First week of year`                                                                                                                                            |
| `calendar_picker_first_week_desc`            | `Which day in January the first week of the year must contain (1..7).`                                                                                          |
| `calendar_picker_update_action`              | `Update`                                                                                                                                                        |
| `calendar_picker_cancel_action`              | `Cancel`                                                                                                                                                        |
| `calendar_day_sunday`                        | `Sunday`                                                                                                                                                        |
| `calendar_day_monday`                        | `Monday`                                                                                                                                                        |
| `calendar_day_tuesday`                       | `Tuesday`                                                                                                                                                       |
| `calendar_day_wednesday`                     | `Wednesday`                                                                                                                                                     |
| `calendar_day_thursday`                      | `Thursday`                                                                                                                                                      |
| `calendar_day_friday`                        | `Friday`                                                                                                                                                        |
| `calendar_day_saturday`                      | `Saturday`                                                                                                                                                      |

Per the test-hygiene rules (`feedback_no_wiring_tests`, `feedback_no_trivial_tests`) there are no unit tests for the message file — its content is asserted by the component tests in Tasks 6 and 7 (which `await userEvent.click(screen.getByText(m.calendar_*()))`).

- [ ] **Step 1: Add each key to `messages/en.json`**

After Task 0, the file looks like:

```json
{
  "$schema": "https://inlang.com/schema/inlang-message-format"
}
```

Replace it with the full set (key order doesn't affect output; alphabetical kept for ease of review):

```json
{
  "$schema": "https://inlang.com/schema/inlang-message-format",

  "calendar_apply_globally_desc": "If disabled, week-configuration settings apply only to dates inside journals and do not affect dates created by other plugins or Obsidian itself.",
  "calendar_apply_globally_restart_hint": "You might need to restart Obsidian for changes to take effect.",
  "calendar_apply_globally_title": "Apply week configuration to all dates in vault?",
  "calendar_day_friday": "Friday",
  "calendar_day_monday": "Monday",
  "calendar_day_saturday": "Saturday",
  "calendar_day_sunday": "Sunday",
  "calendar_day_thursday": "Thursday",
  "calendar_day_tuesday": "Tuesday",
  "calendar_day_wednesday": "Wednesday",
  "calendar_picker_cancel_action": "Cancel",
  "calendar_picker_first_week_desc": "Which day in January the first week of the year must contain (1..7).",
  "calendar_picker_first_week_label": "First week of year",
  "calendar_picker_in_use_marker": "Currently used",
  "calendar_picker_start_week_on": "Start week on",
  "calendar_picker_start_week_on_desc": "Which day to treat as the first day of the week.",
  "calendar_picker_update_action": "Update",
  "calendar_picker_use_action": "Use",
  "calendar_preset_custom_description": "Define what day of week to treat as first and how the first week of year is determined.",
  "calendar_preset_custom_name": "Custom",
  "calendar_preset_iso_description": "Week starts on Monday. First week of year includes the first Thursday (Jan 4th).",
  "calendar_preset_iso_name": "ISO 8601",
  "calendar_preset_iso_used": "EU (excluding Portugal) and most other European countries, most of Asia and Oceania.",
  "calendar_preset_locale_description": "Use the week settings defined by Obsidian's current locale.",
  "calendar_preset_locale_name": "Follow system locale",
  "calendar_preset_middle_eastern_description": "Week starts on Saturday. First week of year includes the first Friday (Jan 1st).",
  "calendar_preset_middle_eastern_name": "Middle Eastern",
  "calendar_preset_middle_eastern_used": "Much of the Middle East.",
  "calendar_preset_picker_title": "Week configuration",
  "calendar_preset_western_description": "Week starts on Sunday. First week of year includes the first Saturday (Jan 1st).",
  "calendar_preset_western_name": "Western traditional",
  "calendar_preset_western_used": "Canada, United States, Iceland, Portugal, Japan, Taiwan, Thailand, Hong Kong, Macau, Israel, Egypt, South Africa, the Philippines, and most of Latin America.",
  "calendar_week_config_change": "Change",
  "calendar_week_config_title": "Week configuration"
}
```

- [ ] **Step 2: Regenerate paraglide output**

```bash
npm run compile:i18n
```

Expected: paraglide writes `src/i18n/paraglide/messages.js`, `runtime.js`, and one `messages/<key>.js` per JSON key. The `src/i18n/paraglide/` directory is gitignored — these files are not committed.

- [ ] **Step 3: Verify the generated functions resolve**

```bash
npm run check:types
```

Expected: type-check passes. The `@/i18n` barrel auto-exposes the new functions; later tasks use them as `m.calendar_week_config_title()` etc.

- [ ] **Step 4: Commit**

```bash
git add messages/en.json
git commit -m "feat(i18n): add calendar settings message keys"
```

Only `messages/en.json` is committed — the regenerated `.js` files are gitignored build output. Subsequent contributors (and CI) regenerate them via `npm run compile:i18n` or via the vite plugin in `npm run build` / `npm run dev`.

**Important for later tasks:** every time `messages/en.json` changes, `npm run compile:i18n` must be run before `npm test` so the test files resolve the new `m.*` functions. The compile step is fast (sub-second) so no caching strategy is needed.

## Task 5: `CalendarSettingsBridge`

**Files:**

- Create: `src/calendar/settings/bridge.ts`
- Test: `src/calendar/settings/bridge.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
// src/calendar/settings/bridge.test.ts
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { Container } from "@/infrastructure/di";
import { createSettingsService } from "@/settings/testing";

import { Calendar } from "../calendar";

import { CalendarSettingsBridge } from "./bridge";
import { calendarSlice } from "./slice";

import type { CalendarSliceState } from "./slice";

describe("CalendarSettingsBridge", () => {
  let container: Container;
  let calendar: Calendar;
  let applySpy: ReturnType<typeof vi.spyOn>;

  function build(raw?: { calendar?: CalendarSliceState }) {
    const settings = createSettingsService({ slices: [calendarSlice], raw });
    container = settings.container;
    calendar = new Calendar();
    container.register(Calendar).useValue(calendar);
    applySpy = vi.spyOn(calendar, "applyWeekConfig");
    // bridge is instantiated by registering it; mirror module wiring
    container.register(CalendarSettingsBridge).useClass(CalendarSettingsBridge);
    return { settings: settings.service };
  }

  beforeEach(() => {
    applySpy?.mockReset();
  });

  afterEach(() => {
    void container?.dispose().catch(() => null);
  });

  it('pushes "locale" on first construction when slice defaults to locale', async () => {
    const { settings } = build();
    await settings.initialize();
    container.resolve(CalendarSettingsBridge);
    expect(applySpy).toHaveBeenCalledWith("locale", { global: false });
  });

  it("pushes the custom week when the slice changes to custom", async () => {
    const { settings } = build();
    await settings.initialize();
    container.resolve(CalendarSettingsBridge);
    applySpy.mockClear();
    settings.getSlice(calendarSlice).state = { mode: "custom", dow: 0, doy: 6, global: false };
    await Promise.resolve();
    expect(applySpy).toHaveBeenCalledWith({ dow: 0, doy: 6 }, { global: false });
  });

  it("propagates the global flag when slice global is true", async () => {
    const { settings } = build();
    await settings.initialize();
    container.resolve(CalendarSettingsBridge);
    applySpy.mockClear();
    settings.getSlice(calendarSlice).state = { mode: "custom", dow: 1, doy: 4, global: true };
    await Promise.resolve();
    expect(applySpy).toHaveBeenCalledWith({ dow: 1, doy: 4 }, { global: true });
  });

  it('pushes "locale" again when slice reverts to locale', async () => {
    const { settings } = build({ calendar: { mode: "custom", dow: 1, doy: 4, global: false } });
    await settings.initialize();
    container.resolve(CalendarSettingsBridge);
    applySpy.mockClear();
    settings.getSlice(calendarSlice).state = { mode: "locale" };
    await Promise.resolve();
    expect(applySpy).toHaveBeenCalledWith("locale", { global: false });
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- --run src/calendar/settings/bridge.test.ts`
Expected: FAIL — `./bridge` does not resolve.

- [ ] **Step 3: Write the bridge**

```ts
// src/calendar/settings/bridge.ts
import { match } from "ts-pattern";
import { watchEffect, type WatchStopHandle } from "vue";

import { inject } from "@/infrastructure/di";
import { SettingsService } from "@/settings";

import { Calendar } from "../calendar";

import { calendarSlice, type CalendarSliceState } from "./slice";

export class CalendarSettingsBridge {
  readonly #calendar = inject(Calendar);
  readonly #settings = inject(SettingsService);
  readonly #stop: WatchStopHandle;

  constructor() {
    const slice = this.#settings.getSlice(calendarSlice);
    this.#stop = watchEffect(() => this.#sync(slice.state));
  }

  [Symbol.dispose](): void {
    this.#stop();
  }

  #sync(state: CalendarSliceState): void {
    match(state)
      .with({ mode: "locale" }, () => {
        this.#calendar.applyWeekConfig("locale", { global: false });
      })
      .with({ mode: "custom" }, ({ dow, doy, global }) => {
        this.#calendar.applyWeekConfig({ dow, doy }, { global });
      })
      .exhaustive();
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- --run src/calendar/settings/bridge.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/calendar/settings/bridge.ts src/calendar/settings/bridge.test.ts
git commit -m "feat(calendar): bridge slice changes into Calendar.applyWeekConfig"
```

---

## Task 6: `WeekPresetPickerModal` (component + definition)

**Files:**

- Create: `src/calendar/settings/ui/week-preset-picker-modal.ts`
- Create: `src/calendar/settings/ui/WeekPresetPickerModal.vue`
- Test: `src/calendar/settings/ui/WeekPresetPickerModal.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
// src/calendar/settings/ui/WeekPresetPickerModal.test.ts
import { cleanup, render, screen } from "@testing-library/vue";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { defineComponent, h } from "vue";

import { m } from "@/i18n";

import WeekPresetPickerModal from "./WeekPresetPickerModal.vue";

import type { CalendarSliceState } from "../slice";
import type { ModalApi } from "@/infrastructure/host/modals";

function mountModal(current: CalendarSliceState, api: ModalApi<CalendarSliceState>) {
  const Harness = defineComponent({
    components: { WeekPresetPickerModal },
    setup() {
      return () => h(WeekPresetPickerModal, { current, api });
    },
  });
  return render(Harness);
}

function rowFor(name: string): HTMLElement {
  const heading = screen.getByText(name);
  const row = heading.closest(".setting-item");
  if (!row) throw new Error(`row for ${name} not found`);
  return row as HTMLElement;
}

afterEach(() => cleanup());

describe("WeekPresetPickerModal", () => {
  it("submits the ISO 8601 preset when its Use button is clicked then Update is pressed", async () => {
    const api: ModalApi<CalendarSliceState> = { submit: vi.fn(), cancel: vi.fn() };
    mountModal({ mode: "locale" }, api);

    const useButton = rowFor(m.calendar_preset_iso_name()).querySelector("button");
    await userEvent.click(useButton!);
    await userEvent.click(screen.getByText(m.calendar_picker_update_action()));

    expect(api.submit).toHaveBeenCalledWith({ mode: "custom", dow: 1, doy: 4, global: false });
  });

  it('submits { mode: "locale" } when the locale row\'s Use button + Update are clicked', async () => {
    const api: ModalApi<CalendarSliceState> = { submit: vi.fn(), cancel: vi.fn() };
    mountModal({ mode: "custom", dow: 1, doy: 4, global: false }, api);

    const useButton = rowFor(m.calendar_preset_locale_name()).querySelector("button");
    await userEvent.click(useButton!);
    await userEvent.click(screen.getByText(m.calendar_picker_update_action()));

    expect(api.submit).toHaveBeenCalledWith({ mode: "locale" });
  });

  it("switches into custom mode when the Custom row's Use button is clicked, even from a preset", async () => {
    const api: ModalApi<CalendarSliceState> = { submit: vi.fn(), cancel: vi.fn() };
    mountModal({ mode: "custom", dow: 1, doy: 4, global: false }, api);

    const useButton = rowFor(m.calendar_preset_custom_name()).querySelector("button");
    await userEvent.click(useButton!);

    // The dropdown + number input only render once custom is the active choice.
    expect(screen.queryByText(m.calendar_picker_start_week_on())).not.toBeNull();
    expect(screen.queryByText(m.calendar_picker_first_week_label())).not.toBeNull();
  });

  it("submits the custom dow/doy when in custom mode with edited values", async () => {
    const api: ModalApi<CalendarSliceState> = { submit: vi.fn(), cancel: vi.fn() };
    mountModal({ mode: "custom", dow: 1, doy: 4, global: false }, api);
    await userEvent.click(rowFor(m.calendar_preset_custom_name()).querySelector("button")!);

    // Set dow=3 (Wednesday) via the dropdown
    const dropdown = rowFor(m.calendar_picker_start_week_on()).querySelector("select");
    await userEvent.selectOptions(dropdown!, "3");

    // Set firstDayOfYear=2 via the number input → expected doy = 7 + 3 - 2 = 8
    const numberInput = rowFor(m.calendar_picker_first_week_label()).querySelector("input");
    await userEvent.clear(numberInput!);
    await userEvent.type(numberInput!, "2");

    await userEvent.click(screen.getByText(m.calendar_picker_update_action()));
    expect(api.submit).toHaveBeenCalledWith({ mode: "custom", dow: 3, doy: 8, global: false });
  });

  it("cancels via the api when the Cancel button is clicked", async () => {
    const api: ModalApi<CalendarSliceState> = { submit: vi.fn(), cancel: vi.fn() };
    mountModal({ mode: "locale" }, api);

    await userEvent.click(screen.getByText(m.calendar_picker_cancel_action()));
    expect(api.cancel).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- --run src/calendar/settings/ui/WeekPresetPickerModal.test.ts`
Expected: FAIL — component file does not exist.

- [ ] **Step 3: Write the modal definition**

```ts
// src/calendar/settings/ui/week-preset-picker-modal.ts
import { defineModal } from "@/infrastructure/host/modals";
import { m } from "@/i18n";

import WeekPresetPickerModal from "./WeekPresetPickerModal.vue";

import type { CalendarSliceState } from "../slice";

export const weekPresetPickerModal = defineModal<{ current: CalendarSliceState }, CalendarSliceState>({
  component: WeekPresetPickerModal,
  title: () => m.calendar_preset_picker_title(),
});
```

- [ ] **Step 4: Write `WeekPresetPickerModal.vue`**

The local state separates **what the user chose** (`localChoice`) from **what they typed for custom mode** (`customDow`, `customFirstDay`). This avoids the v2 ambiguity where "user is on custom" and "values happen to match a preset" are indistinguishable.

```vue
<!-- src/calendar/settings/ui/WeekPresetPickerModal.vue -->
<script setup lang="ts">
import { ref } from "vue";
import { match } from "ts-pattern";

import { m } from "@/i18n";
import type { ModalApi } from "@/infrastructure/host/modals";
import UiSettingRow from "@/ui/UiSettingRow.vue";
import UiButton from "@/ui/UiButton.vue";
import UiDropdown from "@/ui/UiDropdown.vue";
import UiNumberInput from "@/ui/UiNumberInput.vue";

import { detectCurrentPreset, weekPresets, type WeekPreset } from "@/calendar/presets";
import type { CalendarSliceState } from "../slice";

const props = defineProps<{ current: CalendarSliceState; api: ModalApi<CalendarSliceState> }>();

type LocalChoice = "locale" | WeekPreset["id"] | "custom";

function initialChoice(): LocalChoice {
  if (props.current.mode === "locale") return "locale";
  const detected = detectCurrentPreset({ dow: props.current.dow, doy: props.current.doy });
  return detected === "custom" ? "custom" : detected.id;
}

const localChoice = ref<LocalChoice>(initialChoice());
const customDow = ref<string>(props.current.mode === "custom" ? String(props.current.dow) : "1");
const customFirstDay = ref<number>(props.current.mode === "custom" ? 7 + props.current.dow - props.current.doy : 4);
const stagedGlobal = props.current.mode === "custom" ? props.current.global : false;

function pickLocale(): void {
  localChoice.value = "locale";
}

function pickPreset(preset: WeekPreset): void {
  localChoice.value = preset.id;
}

function pickCustom(): void {
  localChoice.value = "custom";
}

function update(): void {
  if (localChoice.value === "locale") {
    props.api.submit({ mode: "locale" });
    return;
  }
  if (localChoice.value === "custom") {
    const dow = Number.parseInt(customDow.value, 10);
    const firstDay = Math.min(7, Math.max(1, Math.round(customFirstDay.value)));
    const doy = 7 + dow - firstDay;
    props.api.submit({ mode: "custom", dow, doy, global: stagedGlobal });
    return;
  }
  const preset = weekPresets.find((p) => p.id === localChoice.value);
  if (!preset) {
    props.api.cancel();
    return;
  }
  props.api.submit({ mode: "custom", dow: preset.dow, doy: preset.doy, global: stagedGlobal });
}

const dowOptions: { value: string; label: () => string }[] = [
  { value: "0", label: () => m.calendar_day_sunday() },
  { value: "1", label: () => m.calendar_day_monday() },
  { value: "2", label: () => m.calendar_day_tuesday() },
  { value: "3", label: () => m.calendar_day_wednesday() },
  { value: "4", label: () => m.calendar_day_thursday() },
  { value: "5", label: () => m.calendar_day_friday() },
  { value: "6", label: () => m.calendar_day_saturday() },
];

function presetName(preset: WeekPreset): string {
  return match(preset.id)
    .with("iso-8601", () => m.calendar_preset_iso_name())
    .with("western", () => m.calendar_preset_western_name())
    .with("middle-eastern", () => m.calendar_preset_middle_eastern_name())
    .exhaustive();
}

function presetDescription(preset: WeekPreset): string {
  return match(preset.id)
    .with("iso-8601", () => m.calendar_preset_iso_description())
    .with("western", () => m.calendar_preset_western_description())
    .with("middle-eastern", () => m.calendar_preset_middle_eastern_description())
    .exhaustive();
}

function presetUsed(preset: WeekPreset): string {
  return match(preset.id)
    .with("iso-8601", () => m.calendar_preset_iso_used())
    .with("western", () => m.calendar_preset_western_used())
    .with("middle-eastern", () => m.calendar_preset_middle_eastern_used())
    .exhaustive();
}
</script>

<template>
  <div>
    <UiSettingRow :name="m.calendar_preset_locale_name()">
      <template #description>{{ m.calendar_preset_locale_description() }}</template>
      <span v-if="localChoice === 'locale'">{{ m.calendar_picker_in_use_marker() }}</span>
      <UiButton v-else @click="pickLocale">{{ m.calendar_picker_use_action() }}</UiButton>
    </UiSettingRow>

    <UiSettingRow v-for="preset in weekPresets" :key="preset.id" :name="presetName(preset)">
      <template #description>
        <div class="whitespace">{{ presetDescription(preset) }}</div>
        <div>{{ presetUsed(preset) }}</div>
      </template>
      <span v-if="localChoice === preset.id">{{ m.calendar_picker_in_use_marker() }}</span>
      <UiButton v-else @click="pickPreset(preset)">{{ m.calendar_picker_use_action() }}</UiButton>
    </UiSettingRow>

    <UiSettingRow :name="m.calendar_preset_custom_name()">
      <template #description>{{ m.calendar_preset_custom_description() }}</template>
      <span v-if="localChoice === 'custom'">{{ m.calendar_picker_in_use_marker() }}</span>
      <UiButton v-else @click="pickCustom">{{ m.calendar_picker_use_action() }}</UiButton>
    </UiSettingRow>

    <template v-if="localChoice === 'custom'">
      <UiSettingRow :name="m.calendar_picker_start_week_on()">
        <template #description>{{ m.calendar_picker_start_week_on_desc() }}</template>
        <UiDropdown v-model="customDow">
          <option v-for="opt in dowOptions" :key="opt.value" :value="opt.value">{{ opt.label() }}</option>
        </UiDropdown>
      </UiSettingRow>
      <UiSettingRow :name="m.calendar_picker_first_week_label()">
        <template #description>{{ m.calendar_picker_first_week_desc() }}</template>
        <UiNumberInput v-model="customFirstDay" :min="1" :max="7" />
      </UiSettingRow>
    </template>

    <UiSettingRow>
      <UiButton @click="props.api.cancel()">{{ m.calendar_picker_cancel_action() }}</UiButton>
      <UiButton cta @click="update">{{ m.calendar_picker_update_action() }}</UiButton>
    </UiSettingRow>
  </div>
</template>

<style scoped>
.whitespace {
  white-space: pre-wrap;
}
</style>
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm test -- --run src/calendar/settings/ui/WeekPresetPickerModal.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 6: Commit**

```bash
git add src/calendar/settings/ui/week-preset-picker-modal.ts src/calendar/settings/ui/WeekPresetPickerModal.vue src/calendar/settings/ui/WeekPresetPickerModal.test.ts
git commit -m "feat(calendar): week-preset picker modal"
```

---

## Task 7: `CalendarWeekBlock` dashboard component

**Files:**

- Create: `src/calendar/settings/ui/CalendarWeekBlock.vue`
- Test: `src/calendar/settings/ui/CalendarWeekBlock.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
// src/calendar/settings/ui/CalendarWeekBlock.test.ts
import { cleanup, render, screen } from "@testing-library/vue";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { Container } from "@/infrastructure/di";
import { provideInjectorOnApp } from "@/infrastructure/di";
import { ModalService } from "@/infrastructure/host/modals";
import { AsyncResult } from "@/infrastructure/result";
import { m } from "@/i18n";
import { createSettingsService } from "@/settings/testing";

import { calendarSlice } from "../slice";
import CalendarWeekBlock from "./CalendarWeekBlock.vue";
import { weekPresetPickerModal } from "./week-preset-picker-modal";

import type { CalendarSliceState } from "../slice";

function setupContainer(initial?: CalendarSliceState) {
  const settings = createSettingsService({
    slices: [calendarSlice],
    raw: initial ? { calendar: initial } : undefined,
  });
  const container = settings.container;

  const modalService = {
    open: vi.fn(),
  } as unknown as ModalService;
  container.register(ModalService).useValue(modalService);

  return { container, settings: settings.service, modalService };
}

function mount(container: Container) {
  return render(CalendarWeekBlock, {
    global: {
      plugins: [
        {
          install(app) {
            provideInjectorOnApp(app, container);
          },
        },
      ],
    },
  });
}

afterEach(() => cleanup());

describe("CalendarWeekBlock", () => {
  it("renders the Change button", async () => {
    const { container, settings } = setupContainer();
    await settings.initialize();
    mount(container);
    expect(screen.getByText(m.calendar_week_config_change())).toBeTruthy();
  });

  it("hides the global toggle when mode is locale", async () => {
    const { container, settings } = setupContainer({ mode: "locale" });
    await settings.initialize();
    mount(container);
    expect(screen.queryByText(m.calendar_apply_globally_title())).toBeNull();
  });

  it("shows the global toggle when mode is custom", async () => {
    const { container, settings } = setupContainer({ mode: "custom", dow: 1, doy: 4, global: false });
    await settings.initialize();
    mount(container);
    expect(screen.getByText(m.calendar_apply_globally_title())).toBeTruthy();
  });

  it("opens the modal when Change is clicked", async () => {
    const { container, settings, modalService } = setupContainer();
    await settings.initialize();
    (modalService.open as ReturnType<typeof vi.fn>).mockReturnValue(
      AsyncResult.fromPromise(new Promise(() => {}), () => new Error("never")),
    );
    mount(container);
    await userEvent.click(screen.getByText(m.calendar_week_config_change()));
    expect(modalService.open).toHaveBeenCalledWith(
      weekPresetPickerModal,
      expect.objectContaining({ current: expect.any(Object) }),
    );
  });

  it("updates the slice state when the modal resolves Ok", async () => {
    const { container, settings, modalService } = setupContainer();
    await settings.initialize();
    (modalService.open as ReturnType<typeof vi.fn>).mockReturnValue(
      AsyncResult.ok<CalendarSliceState>({ mode: "custom", dow: 0, doy: 6, global: false }),
    );
    mount(container);
    await userEvent.click(screen.getByText(m.calendar_week_config_change()));
    await Promise.resolve();
    expect(settings.getSlice(calendarSlice).state).toEqual({
      mode: "custom",
      dow: 0,
      doy: 6,
      global: false,
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- --run src/calendar/settings/ui/CalendarWeekBlock.test.ts`
Expected: FAIL — `CalendarWeekBlock.vue` does not exist.

- [ ] **Step 3: Write `CalendarWeekBlock.vue`**

```vue
<!-- src/calendar/settings/ui/CalendarWeekBlock.vue -->
<script setup lang="ts">
import { computed } from "vue";

import { useService } from "@/infrastructure/di";
import { useModalService } from "@/infrastructure/host/modals";
import { m } from "@/i18n";
import { SettingsService } from "@/settings";
import UiSettingRow from "@/ui/UiSettingRow.vue";
import UiButton from "@/ui/UiButton.vue";
import UiToggle from "@/ui/UiToggle.vue";

import { detectCurrentPreset } from "@/calendar/presets";
import { calendarSlice } from "../slice";
import { weekPresetPickerModal } from "./week-preset-picker-modal";

const settings = useService(SettingsService);
const modals = useModalService();
const slice = settings.getSlice(calendarSlice);

const presetSummary = computed(() => {
  const state = slice.state;
  if (state.mode === "locale") return m.calendar_preset_locale_description();
  const preset = detectCurrentPreset({ dow: state.dow, doy: state.doy });
  if (preset === "custom") return m.calendar_preset_custom_description();
  if (preset.id === "iso-8601") return m.calendar_preset_iso_description();
  if (preset.id === "western") return m.calendar_preset_western_description();
  return m.calendar_preset_middle_eastern_description();
});

const globalRef = computed({
  get: () => (slice.state.mode === "custom" ? slice.state.global : false),
  set: (v: boolean) => {
    if (slice.state.mode !== "custom") return;
    slice.state = { ...slice.state, global: v };
  },
});

function change(): void {
  void modals.open(weekPresetPickerModal, { current: slice.state }).tap((value) => {
    slice.state = value;
  });
}
</script>

<template>
  <UiSettingRow heading :name="m.calendar_week_config_title()">
    <template #description>{{ presetSummary }}</template>
    <UiButton @click="change">{{ m.calendar_week_config_change() }}</UiButton>
  </UiSettingRow>
  <UiSettingRow v-if="slice.state.mode === 'custom'" :name="m.calendar_apply_globally_title()">
    <template #description>
      {{ m.calendar_apply_globally_desc() }}
      <div class="journal-hint">{{ m.calendar_apply_globally_restart_hint() }}</div>
    </template>
    <UiToggle v-model="globalRef" />
  </UiSettingRow>
</template>

<style scoped>
.journal-hint {
  color: var(--text-warning);
}
</style>
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- --run src/calendar/settings/ui/CalendarWeekBlock.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/calendar/settings/ui/CalendarWeekBlock.vue src/calendar/settings/ui/CalendarWeekBlock.test.ts
git commit -m "feat(calendar): week-configuration dashboard block"
```

---

## Task 8: Module wiring + index.ts + main.ts

**Files:**

- Create: `src/calendar/settings/module.ts`
- Modify: `src/calendar/index.ts`
- Modify: `src/main.ts`

Per memory `feedback_no_wiring_tests`, no test for the module itself; wiring is verified by the existence of the integration in `main.ts` and the green test suite.

- [ ] **Step 1: Write the module**

```ts
// src/calendar/settings/module.ts
import type { Module } from "@/infrastructure/di";
import { DashboardBlockToken, SliceDefinitionToken, defineDashboardBlock } from "@/settings";

import { CalendarSettingsBridge } from "./bridge";
import { calendarSlice } from "./slice";
import CalendarWeekBlock from "./ui/CalendarWeekBlock.vue";

export const calendarSettingsModule: Module = {
  register(c) {
    c.register(SliceDefinitionToken).useValue(calendarSlice).multi();
    c.register(DashboardBlockToken)
      .useValue(
        defineDashboardBlock({
          key: "calendar-week",
          component: CalendarWeekBlock,
          order: 10,
        }),
      )
      .multi();
    c.register(CalendarSettingsBridge).useClass(CalendarSettingsBridge).eager();
  },
};
```

- [ ] **Step 2: Update `src/calendar/index.ts`**

```ts
// src/calendar/index.ts
export { CalendarDate } from "./calendar-date";
export { Clock } from "./clock";
export { Interval } from "./interval";
export { OpenInterval } from "./open-interval";

export { DayPeriod } from "./period-day";
export { WeekPeriod } from "./period-week";
export { MonthPeriod } from "./period-month";
export { QuarterPeriod } from "./period-quarter";
export { YearPeriod } from "./period-year";
export { DecadePeriod } from "./period-decade";

export { type Period, type PeriodKind, type PeriodBase } from "./period";
export { type AnchorString } from "./types";

export { DateTimeError, IntervalError, ParseError } from "./errors";

export { CalendarModule } from "./module";

export { weekPresets, detectCurrentPreset, type WeekPreset } from "./presets";
export { calendarSlice, type CalendarSliceState } from "./settings/slice";
export { calendarSettingsModule } from "./settings/module";
```

- [ ] **Step 3: Update `src/main.ts`**

Replace the body of `onload()` so the calendar settings module is registered after the data-layer modules and before `autoLoad`:

```ts
// src/main.ts
import { getLanguage, Notice, Plugin } from "obsidian";

import { CalendarModule, calendarSettingsModule } from "@/calendar";
import { initLocale } from "@/i18n";
import { Container } from "@/infrastructure/di";
import { FlowsModule } from "@/infrastructure/flows";
import { createHostModule } from "@/infrastructure/host";
import { LoggerModule } from "@/infrastructure/logger";
import { settingsModule, SettingsService } from "@/settings";

export default class JournalPlugin extends Plugin {
  #container?: Container;

  async onload(): Promise<void> {
    initLocale(getLanguage());

    const container = new Container();
    container.addModule(LoggerModule);
    container.addModule(FlowsModule);
    container.addModule(createHostModule(this));
    container.addModule(settingsModule);
    container.addModule(CalendarModule);
    container.addModule(calendarSettingsModule);
    await container.autoLoad();

    const init = await container.resolve(SettingsService).initialize();
    if (init.kind === "err") {
      new Notice(`Journal: failed to load settings — ${init.error.message}`);
      await container.dispose();
      return;
    }

    this.#container = container;
  }

  onunload(): void {
    void this.#container?.dispose().catch(() => null);
    this.#container = undefined;
  }
}
```

- [ ] **Step 4: Run the full quality gates**

```bash
npm test
npm run check:types
npm run check:lint
```

Expected: 100% green for tests; type-check clean; no new lint errors.

- [ ] **Step 5: Commit**

```bash
git add src/calendar/settings/module.ts src/calendar/index.ts src/main.ts
git commit -m "feat(calendar): wire calendarSettingsModule"
```

---

## Task 9: Manual UI smoke + cleanup

**Per the v3 testing memory `feedback_quality_gates`:** at the end of a spec, run the per-spec gate (smoke). For this plugin there is no `test:e2e:smoke` configured (no `e2e` script in `package.json`); the manual equivalent is opening the plugin in `test-vault/` and exercising the dashboard.

- [ ] **Step 1: Manually verify the dashboard**

```bash
npm run build
```

Then open `test-vault/` in Obsidian (or in your usual dev setup) and verify:

1. Open the Journal settings tab — the "Week configuration" block appears at the top with the locale description.
2. Click "Change" — modal opens, "Follow system locale" row is marked `Currently used`.
3. Click "Use" on the ISO 8601 row — marker moves to ISO 8601.
4. Click "Update" — modal closes. The block now shows the ISO description. A new "Apply week configuration to all dates in vault?" toggle row appears.
5. Toggle the global toggle — no visible error.
6. Reopen the modal — ISO 8601 still marked. Click "Use" on the "Custom" row — the start-day dropdown + first-week-of-year number input appear. Submit.
7. Re-open and click "Use" on "Follow system locale" — submit. The block reverts to the locale description and the global toggle row disappears.

- [ ] **Step 2: If any UI step fails, file a follow-up note**

Add a one-line entry under `## Follow-ups` in the spec describing what didn't behave as expected. Do NOT patch on the fly; UI fixes belong in their own commit cycle following TDD.

- [ ] **Step 3: Final commit (if a follow-up note was added)**

```bash
git add docs/superpowers/specs/2026-05-14-v3-calendar-settings-design.md
git commit -m "docs(specs): record calendar settings UI smoke follow-ups"
```

---

## Self-review checklist (for the reviewer reading this plan)

- [ ] Every spec section maps to a task: presets (T1), Calendar extensions (T2), slice (T3), i18n (T4), bridge (T5), modal (T6), block (T7), wiring (T8).
- [ ] Every test step shows the actual test code.
- [ ] Every implementation step shows the actual implementation code.
- [ ] Names are consistent: `calendarSlice`, `CalendarSliceState`, `calendarSettingsModule`, `CalendarSettingsBridge`, `weekPresets`, `detectCurrentPreset`, `WeekPreset`, `weekPresetPickerModal`, `WeekPresetPickerModal.vue`, `CalendarWeekBlock.vue`.
- [ ] The bridge tests register `Calendar` as a value (already constructed) so `vi.spyOn` is observable; the production wiring stays `.useClass(CalendarSettingsBridge).eager()` per the module.
- [ ] The "follow-ups" deferred in the spec are not added as tasks here (weekly-note rename, calendarView slice, v2→v3 migration).
