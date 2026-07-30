# Full Note Path Preview Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Note creation section's two partial previews (resolved note name, resolved folder) with one full-path preview at the top of the section.

**Architecture:** `NotePathService.pathFor` already returns the complete `folder/name.md`. The existing `NoteNamePreview.vue` already calls it and already branches on `Ok` / `EmptyNoteNameError` / no-metadata — it just throws the folder away. Rename it to `NotePathPreview.vue`, render the whole value, mount it as the first child of the section's collapsible block, and delete the two per-field previews. Warnings stay in the rows they belong to.

**Tech Stack:** Vue 3 SFCs (`<script setup lang="ts">`), Vitest + `@testing-library/vue` + `@testing-library/user-event`, paraglide-js i18n from `messages/*.json`, custom DI container.

**Spec:** `docs/superpowers/specs/2026-07-30-full-note-path-preview-design.md`

## Global Constraints

- Quality gates, all three must pass before any commit: `npm run test`, `npm run check:types`, `npm run check:lint`. These are **npm** scripts, not pnpm.
- After editing any `messages/*.json`, run `npm run compile:i18n`. `src/i18n/paraglide` is generated and git-ignored — **never stage it**. Without this step `m.journal_edit_note_path_preview_label` does not exist and `check:types` fails.
- After editing any `messages/*.json` other than `en.json`, run `npm run check:i18n` (domain-noun glossary guard).
- Never add an `eslint-disable` comment. Fix the code instead.
- Never add a `Co-Authored-By` trailer to a commit message.
- Commit to the current branch (`v3-ai`). Do not create a branch.
- New copy is sentence case, en-US, per §A of `docs/2026-07-13-ux-text-audit.md`.
- Relative imports in this codebase are sorted **case-insensitively** by module path (`../DateFormatPreview.vue`, `../FolderInput.vue`, `../use-collision-check`, `../VariableReferenceHint.vue`, `../wrong-week`, `../WrongWeekWarning.vue`). `check:lint` enforces this.
- `messages/en.json` uses **2-space** indentation. Every other `messages/*.json` uses **tab** indentation. Match the file you are editing.
- One behavior per test. No `and`/comma-list test names. Test scope goes in nested `describe` blocks.

## File Structure

| File                                                            | Responsibility                                                                                                                             |
| --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `src/journals/settings/ui/NotePathPreview.vue`                  | Resolves today's entry to a full vault path and renders it, or renders the empty-name warning. Renamed from `NoteNamePreview.vue`.         |
| `src/journals/settings/ui/NotePathPreview.test.ts`              | Component tests. Renamed from `NoteNamePreview.test.ts`.                                                                                   |
| `src/journals/settings/ui/sections/NoteCreationSection.vue`     | Mounts the preview at the top; loses both per-field previews; mounts `WrongWeekWarning` directly in the folder row.                        |
| `src/journals/settings/ui/sections/NoteCreationSection.test.ts` | Section tests: preview position/content, warning ownership.                                                                                |
| `messages/*.json` (11 files)                                    | `journal_edit_note_path_preview_label` added; `journal_edit_note_name_preview_label` and `journal_edit_folder_path_preview_label` removed. |
| `docs/manual-testing-checklist-v3.md`                           | Three manual items in §2.                                                                                                                  |

Unchanged and still needed: `use-today-metadata.ts` (also consumed by `TemplateStringPreview.vue`), `TemplateStringPreview.vue` (still used by `TemplatesSection.vue`), `wrong-week.ts`, `WrongWeekWarning.vue`.

---

### Task 1: Full-path preview replaces the note-name preview

The i18n key rename and the component rename land together: deleting `journal_edit_note_name_preview_label` while its call site still exists breaks `check:types`, so both happen in one commit.

**Files:**

- Rename: `src/journals/settings/ui/NoteNamePreview.vue` → `src/journals/settings/ui/NotePathPreview.vue`
- Rename: `src/journals/settings/ui/NoteNamePreview.test.ts` → `src/journals/settings/ui/NotePathPreview.test.ts`
- Modify: `src/journals/settings/ui/sections/NoteCreationSection.vue` (imports; add preview at top of block; drop `<NoteNamePreview>` from the name-template row)
- Modify: `src/journals/settings/ui/sections/NoteCreationSection.test.ts:144-155`
- Modify: all 11 `messages/*.json`

**Interfaces:**

- Consumes: `NotePathService.pathFor(name: string, metadata: JournalMetadata): Result<VaultPath, JournalNotFoundError | EmptyNoteNameError>`; `useTodayMetadata(journalName: string): ComputedRef<JournalMetadata | undefined>`; `EmptyNoteNameError` — all exported from `@/journals` / `./use-today-metadata` and used unchanged by the current `NoteNamePreview.vue`.
- Produces: SFC `NotePathPreview.vue` with props `{ journalName: string }`; message function `m.journal_edit_note_path_preview_label()`.

- [ ] **Step 1: Rename the i18n key in `messages/en.json`**

`messages/en.json:1261` currently reads:

```json
  "journal_edit_note_name_preview_label": "Resolved note name:",
```

Replace that single line with (2-space indent, key stays in the same position — the surrounding block is only loosely alphabetical and this is where the old key sat):

```json
  "journal_edit_note_path_preview_label": "Resolved note path:",
```

"Resolved …:" matches its siblings `journal_edit_date_format_preview_label` ("Formatted date:") and `journal_edit_template_path_preview_label` ("Resolved template path:").

- [ ] **Step 2: Rename the same key in the 11 other locale files**

In each file, replace the `journal_edit_note_name_preview_label` line with a `journal_edit_note_path_preview_label` line carrying the value below. **Keep the file's tab indentation.** Each new value follows that locale's own `journal_edit_template_path_preview_label` phrasing, with the note noun the glossary requires.

| File               | Replace this value                 | With this value                  |
| ------------------ | ---------------------------------- | -------------------------------- |
| `messages/de.json` | `"Name der gelösten Notiz:"`       | `"Aufgelöster Notizpfad:"`       |
| `messages/es.json` | `"Nota resuelta:"`                 | `"Ruta de nota resuelta:"`       |
| `messages/fr.json` | `"Nom de la note résolue :"`       | `"Chemin de la note résolu :"`   |
| `messages/it.json` | `"Nome della nota risolta:"`       | `"Percorso della nota risolto:"` |
| `messages/ja.json` | `"解決済みノート名:"`              | `"解決済みノートパス:"`          |
| `messages/ko.json` | `"해결된 노트 이름:"`              | `"해결된 노트 경로:"`            |
| `messages/pt.json` | `"Nome da nota resolvida:"`        | `"Caminho da nota resolvido:"`   |
| `messages/ru.json` | `"Название исправленной заметки:"` | `"Разрешённый путь к заметке:"`  |
| `messages/uk.json` | `"Назва вирішеної нотатки:"`       | `"Вирішений шлях нотатки:"`      |
| `messages/zh.json` | `"已解决的笔记名称："`             | `"已解析的笔记路径："`           |

Note: `messages/zh.json` uses the full-width colon `：`, and `messages/fr.json` puts a space before `:`. Preserve both.

Hand-writing translations is the established practice here — `translate:i18n` needs a Google API key, so feature commits carry all 11 locales (see `247ae23f`, `3266ab12`).

- [ ] **Step 3: Compile messages and verify the glossary**

Run:

```bash
npm run compile:i18n && npm run check:i18n
```

Expected: both succeed. `check:i18n` prints nothing on success. If it flags a locale, the value used a banned domain noun — reread `scripts/check-i18n-glossary.mjs` for that locale's sanctioned term.

Do **not** `git add src/i18n/paraglide` — it is git-ignored.

- [ ] **Step 4: Rename the component and its test with `git mv`**

```bash
git mv src/journals/settings/ui/NoteNamePreview.vue src/journals/settings/ui/NotePathPreview.vue
git mv src/journals/settings/ui/NoteNamePreview.test.ts src/journals/settings/ui/NotePathPreview.test.ts
```

`git mv` (not delete + create) so the file history follows.

- [ ] **Step 5: Write the failing tests**

Replace the whole body of `src/journals/settings/ui/NotePathPreview.test.ts` with the following. The changes from the old file: `setupDaily` now takes a `{ nameTemplate?, folder? }` override object instead of a bare `nameTemplate` string, the import points at the renamed SFC, and every assertion is a full path rather than a basename.

```ts
import { cleanup, render, screen, waitFor } from "@testing-library/vue";
import { createNanoEvents } from "nanoevents";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { installTestCalendar } from "@/calendar/testing";
import { m } from "@/i18n";
import { provideInjectorOnApp, type Container } from "@/infrastructure/di";
import {
  CycleService,
  FrontmatterService,
  journalConfigCollection,
  JournalsIndex,
  NotePathService,
  NumberingService,
} from "@/journals";
import { JournalsRepository } from "@/journals/repository";
import { JournalsEventsToken } from "@/journals/tokens";
import { createSettingsService } from "@/settings/testing";
import { TemplateEngine } from "@/templates";
import { installTestEngine } from "@/templates/testing";

import NotePathPreview from "./NotePathPreview.vue";

let teardown: () => void;
beforeEach(() => {
  ({ teardown } = installTestCalendar());
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-05-19T12:00:00"));
});
afterEach(() => {
  vi.useRealTimers();
  teardown();
  cleanup();
});

async function setupDaily(overrides: { nameTemplate?: string; folder?: string } = {}) {
  const { service, container } = createSettingsService({
    collections: [journalConfigCollection],
    raw: {
      version: 4,
      journals: {
        daily: {
          name: "daily",
          write: { type: "day" },
          timeline: { start: "2026-01-01", end: { kind: "never" } },
          dateFormat: "YYYY-MM-DD",
          frontmatter: {
            dateField: "journal-date",
            startDateField: "journal-start-date",
            endDateField: "journal-end-date",
            addStartDate: false,
            addEndDate: false,
          },
          numbering: { enabled: false, anchorDate: "2026-01-01", allowBefore: false, sources: [] },
          nameTemplate: "{{date}}",
          folder: "",
          templates: [],
          confirmCreation: false,
          autoCreate: false,
          ...overrides,
        },
      },
    },
  });
  await service.initialize();
  container.register(TemplateEngine).useValue(installTestEngine());
  container.register(JournalsEventsToken).useFactory(() => createNanoEvents());
  container.register(JournalsRepository).useClass(JournalsRepository);
  container.register(JournalsIndex).useClass(JournalsIndex);
  container.register(CycleService).useClass(CycleService);
  container.register(NumberingService).useClass(NumberingService);
  container.register(FrontmatterService).useClass(FrontmatterService);
  container.register(NotePathService).useClass(NotePathService);
  return container;
}

function renderPreview(container: Container, journalName: string) {
  return render(NotePathPreview, {
    props: { journalName },
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

describe("NotePathPreview", () => {
  it("renders today's resolved path for a journal with no folder", async () => {
    const container = await setupDaily();
    renderPreview(container, "daily");
    expect(screen.getByText("2026-05-19.md")).toBeTruthy();
  });

  it("prefixes the resolved note name with the resolved folder", async () => {
    const container = await setupDaily({ folder: "Journals/{{date:YYYY}}" });
    renderPreview(container, "daily");
    expect(screen.getByText("Journals/2026/2026-05-19.md")).toBeTruthy();
  });

  it("resolves a folder that consumes the rendered note name", async () => {
    const container = await setupDaily({ folder: "Journals/{{note_name}}" });
    renderPreview(container, "daily");
    expect(screen.getByText("Journals/2026-05-19/2026-05-19.md")).toBeTruthy();
  });

  it("updates reactively when the journal's nameTemplate changes", async () => {
    const container = await setupDaily();
    renderPreview(container, "daily");
    container.resolve(JournalsRepository).update("daily", { nameTemplate: "note-{{date}}" });
    await waitFor(() => {
      expect(screen.getByText("note-2026-05-19.md")).toBeTruthy();
    });
  });

  it("updates reactively when the journal's folder changes", async () => {
    const container = await setupDaily();
    renderPreview(container, "daily");
    container.resolve(JournalsRepository).update("daily", { folder: "Diary" });
    await waitFor(() => {
      expect(screen.getByText("Diary/2026-05-19.md")).toBeTruthy();
    });
  });

  it("warns when the name template resolves to an empty note name", async () => {
    const container = await setupDaily({ nameTemplate: "" });
    renderPreview(container, "daily");
    expect(screen.getByText(m.journal_edit_name_template_empty_warning())).toBeTruthy();
  });

  it("warns when the name template renders only whitespace", async () => {
    const container = await setupDaily({ nameTemplate: " ".repeat(3) });
    renderPreview(container, "daily");
    expect(screen.getByText(m.journal_edit_name_template_empty_warning())).toBeTruthy();
  });

  it("renders nothing when the journal no longer exists", async () => {
    const container = await setupDaily();
    const { container: dom } = renderPreview(container, "ghost");
    expect(dom.textContent ?? "").toBe("");
  });
});
```

Why the `{{note_name}}` case earns its place even though `note-path.test.ts` already covers the service: the old preview built its context from `NotePathService.contextFor`, which has no `note_name` spec, so `renderForPreview`'s `validate` call failed and the folder preview rendered **empty** for exactly that template. This test pins the user-visible fix, not the service.

The three expected paths are the same values `src/journals/notes/note-path.test.ts:44,64,72` already assert for `pathFor`, so they are known-correct, not guesses.

- [ ] **Step 6: Run the new tests to verify they fail**

Run:

```bash
npx vitest run src/journals/settings/ui/NotePathPreview.test.ts
```

Expected: FAIL. The component still renders basenames, so the five path assertions fail with "Unable to find an element with the text: 2026-05-19.md" and similar. The three warning/absence tests already pass — that behavior is unchanged.

`NoteCreationSection.test.ts` is broken at this moment (it still imports the old filename). That is expected; do not run the full suite until Step 8.

- [ ] **Step 7: Rewrite the component**

Replace the whole of `src/journals/settings/ui/NotePathPreview.vue` with:

```vue
<script setup lang="ts">
import { computed } from "vue";

import { m } from "@/i18n";
import { useService } from "@/infrastructure/di";
import { EmptyNoteNameError, NotePathService } from "@/journals";

import { useTodayMetadata } from "./use-today-metadata";

const { journalName } = defineProps<{ journalName: string }>();

const pathSvc = useService(NotePathService);
const metadata = useTodayMetadata(journalName);

type Resolved = { kind: "path"; path: string } | { kind: "empty" } | undefined;

const resolved = computed<Resolved>(() => {
  const md = metadata.value;
  if (!md) return;
  const result = pathSvc.pathFor(journalName, md);
  if (result.isErr()) {
    return result.error instanceof EmptyNoteNameError ? { kind: "empty" } : undefined;
  }
  return { kind: "path", path: result.value };
});
</script>

<template>
  <div v-if="resolved?.kind === 'empty'" class="note-path-preview journal-hint">
    {{ m.journal_edit_name_template_empty_warning() }}
  </div>
  <div v-else-if="resolved?.kind === 'path'" class="note-path-preview">
    {{ m.journal_edit_note_path_preview_label() }}
    <b class="u-pop">{{ resolved.path }}</b>
  </div>
</template>

<style scoped>
.note-path-preview {
  padding-bottom: var(--size-4-2);
}
.journal-hint {
  color: var(--text-warning);
}
/* Preserve significant whitespace in a resolved path so spaces render literally. */
b {
  white-space: pre;
}
</style>
```

Three things to keep as written:

- Two sibling roots with explicit `resolved?.kind === '…'` checks, not a `v-else` inside a `<template>`. `vue-tsc` narrows the explicit comparison; it does not narrow across a `<template v-else>`, so the tidier-looking version fails `check:types` on `resolved.path`.
- `padding-bottom` on both branches. This component is now the first child of the collapsible block, and without it the preview sits flush against the name-template row.
- The service local is `pathSvc`, not `path`, so it does not read as the same thing as `resolved.path`.

- [ ] **Step 8: Wire it into the section**

In `src/journals/settings/ui/sections/NoteCreationSection.vue`:

Replace the import line

```ts
import NoteNamePreview from "../NoteNamePreview.vue";
```

with (this position keeps the case-insensitive sort: `FolderInput` < `NotePathPreview` < `TemplateStringPreview`)

```ts
import NotePathPreview from "../NotePathPreview.vue";
```

Add the preview as the first child of the default slot, immediately after the `</template>` that closes the `#trigger` slot and before the name-template `<UiSettingRow>`:

```html
<NotePathPreview :journal-name="journalName" />

<UiSettingRow :name="m.journal_edit_name_template_label()"></UiSettingRow>
```

Delete this line from the name-template row's `#description` slot (it sat between `<VariableReferenceHint>` and the collision `<div>`):

```html
<NoteNamePreview :journal-name="journalName" />
```

Leave the collision, invertibility, and move-to-folder blocks in that slot untouched.

- [ ] **Step 9: Fix the section test's preview assertion**

`src/journals/settings/ui/sections/NoteCreationSection.test.ts:144-155` asserts the basename. `journalDefaultsFor` leaves `folder` at `""` (`src/journals/config.ts:345`), so the path is the name plus `.md`. Replace that test with:

```ts
it("live-renders the note path preview as nameTemplate changes", async () => {
  const { storage } = mount();
  const input = screen.getByDisplayValue("{{date}}");
  await userEvent.clear(input);
  await userEvent.type(input, "note-prefix");
  await waitFor(() => {
    expect(storage.daily?.nameTemplate).toBe("note-prefix");
  });
  await waitFor(() => {
    expect(screen.getByText("note-prefix.md")).toBeTruthy();
  });
});
```

`renders all five setting rows` at line 77 still holds — the preview is not a setting row.

- [ ] **Step 10: Run the gates**

```bash
npm run test && npm run check:types && npm run check:lint
```

Expected: all pass. If `check:types` reports `journal_edit_note_path_preview_label` does not exist on `m`, Step 3's `compile:i18n` did not run.

- [ ] **Step 11: Commit**

```bash
git add messages src/journals/settings/ui/NotePathPreview.vue src/journals/settings/ui/NotePathPreview.test.ts \
        src/journals/settings/ui/sections/NoteCreationSection.vue \
        src/journals/settings/ui/sections/NoteCreationSection.test.ts
git commit -m "feat(settings): preview the full new note path at the top of note creation"
```

`git add messages` picks up the renames in all 11 files and nothing else — `messages/` holds only locale JSON. The `git mv` in Step 4 already staged the deletion of the old filenames.

---

### Task 2: Retire the folder-only path preview

**Files:**

- Modify: `src/journals/settings/ui/sections/NoteCreationSection.vue` (folder row's `#description`; imports)
- Modify: `src/journals/settings/ui/sections/NoteCreationSection.test.ts`
- Modify: all 11 `messages/*.json`

**Interfaces:**

- Consumes: `templateHasWrongWeek(template: string): boolean` from `src/journals/settings/ui/wrong-week.ts`; SFC `WrongWeekWarning.vue` (no props); `m.journal_edit_wrong_week_warning()`.
- Produces: nothing new. `TemplateStringPreview.vue` survives untouched for `TemplatesSection.vue`.

- [ ] **Step 1: Write the failing test**

Add this to `src/journals/settings/ui/sections/NoteCreationSection.test.ts` as a new `describe` block, placed after the `dateFormat field` block that ends at line 178 and before `describe("autoCreate field", …)`:

```ts
describe("folder field", () => {
  it("warns when the folder's date format uses the wrong week token", () => {
    mount({ folder: "Journals/{{date:GGGG-[W]W}}" });
    expect(screen.getByText(m.journal_edit_wrong_week_warning())).toBeTruthy();
  });

  it("does not warn for a folder whose date format has no week token", () => {
    mount({ folder: "Journals/{{date:YYYY}}" });
    expect(screen.queryByText(m.journal_edit_wrong_week_warning())).toBeNull();
  });
});
```

`mount` already accepts `Partial<JournalConfig>` overrides (line 44). `templateHasWrongWeek` strips `[…]` literals before looking for `W`, so `GGGG-[W]W` trips it and `YYYY` does not.

These two exist because the warning **changes owner** in this task — it moves out of `TemplateStringPreview` and into the section. Without them, deleting `<TemplateStringPreview>` could silently take the warning with it.

- [ ] **Step 2: Run the tests to verify they fail or pass for the wrong reason**

Run:

```bash
npx vitest run src/journals/settings/ui/sections/NoteCreationSection.test.ts
```

Expected: `warns when the folder's date format uses the wrong week token` **passes** (today `TemplateStringPreview` still renders the warning) and the negative case passes too. This is a characterization test, not a red test — it pins behavior that must survive Step 3. Confirm both pass now, then confirm they still pass in Step 5. If either fails here, stop: the assumption about who renders the warning is wrong and needs rechecking.

- [ ] **Step 3: Move the warning into the folder row**

In `src/journals/settings/ui/sections/NoteCreationSection.vue`, delete the import

```ts
import TemplateStringPreview from "../TemplateStringPreview.vue";
```

and add these two, after `import VariableReferenceHint from "../VariableReferenceHint.vue";` (case-insensitive sort: `VariableReferenceHint` < `wrong-week` < `WrongWeekWarning.vue`, since `-` sorts before `w`):

```ts
import { templateHasWrongWeek } from "../wrong-week";
import WrongWeekWarning from "../WrongWeekWarning.vue";
```

In the folder row, replace this block

```html
<TemplateStringPreview
  :journal-name="journalName"
  :value="config.folder"
  :label="m.journal_edit_folder_path_preview_label()"
/>
```

with

```html
<WrongWeekWarning v-if="templateHasWrongWeek(config.folder)" />
```

`TemplateStringPreview` rendered `<WrongWeekWarning>` outside its own resolved-value `v-if`, so the warning fired even when the preview itself was blank. The `v-if` above preserves that exactly.

- [ ] **Step 4: Delete the dead i18n key from all 11 locale files**

`journal_edit_folder_path_preview_label` now has no call site. Delete its line from each file:

| File               | Delete this line's entry                                           |
| ------------------ | ------------------------------------------------------------------ |
| `messages/en.json` | `"journal_edit_folder_path_preview_label": "Resolved folder:",`    |
| `messages/de.json` | `"journal_edit_folder_path_preview_label": "Aufgelöster Ordner:",` |
| `messages/es.json` | `"journal_edit_folder_path_preview_label": "Carpeta resuelta:",`   |
| `messages/fr.json` | `"journal_edit_folder_path_preview_label": "Dossier résolu :",`    |
| `messages/it.json` | `"journal_edit_folder_path_preview_label": "Cartella risolta:",`   |
| `messages/ja.json` | `"journal_edit_folder_path_preview_label": "解決済みフォルダ:",`   |
| `messages/ko.json` | `"journal_edit_folder_path_preview_label": "해결된 폴더:",`        |
| `messages/pt.json` | `"journal_edit_folder_path_preview_label": "Pasta resolvida:",`    |
| `messages/ru.json` | `"journal_edit_folder_path_preview_label": "Разобранная папка:",`  |
| `messages/uk.json` | `"journal_edit_folder_path_preview_label": "Вирішена папка:",`     |
| `messages/zh.json` | `"journal_edit_folder_path_preview_label": "已解析文件夹：",`      |

Verify nothing still references it:

```bash
grep -rn "journal_edit_folder_path_preview_label" src messages
```

Expected: no output.

- [ ] **Step 5: Recompile and run the gates**

```bash
npm run compile:i18n && npm run check:i18n
npm run test && npm run check:types && npm run check:lint
```

Expected: all pass, including the two `folder field` tests from Step 1 — the warning now comes from the section instead of `TemplateStringPreview`, and the tests cannot tell the difference. That is the point.

- [ ] **Step 6: Commit**

```bash
git add messages src/journals/settings/ui/sections/NoteCreationSection.vue \
        src/journals/settings/ui/sections/NoteCreationSection.test.ts
git commit -m "feat(settings): drop the folder-only path preview from note creation"
```

---

### Task 3: Manual checklist entries

**Files:**

- Modify: `docs/manual-testing-checklist-v3.md` (§2, after line 130)

> **Do not commit this file.** It already carries unrelated uncommitted work in the working tree (91 insertions / 83 deletions as of the start of this plan). Make the edit and leave it unstaged for the repository owner to commit with their own changes. Do not run `git add` or `git commit` in this task, and do not `git stash`.

- [ ] **Step 1: Add the three items**

In `docs/manual-testing-checklist-v3.md`, §2 (Per-journal configuration) currently has these two Folder items at lines 129-130:

```markdown
- [x] **Folder** set to `Journals/Cfg` → new note created there.
- [x] **Folder** with a not-yet-existing nested path → folders auto-created.
```

Insert these three unchecked items immediately after them, matching the file's existing 6-space continuation indent:

```markdown
- [ ] **Note path preview** — set **Folder** to `Journals/{{date:YYYY}}` → the preview at
      the top of the Note creation section shows the whole path including `.md`, and it
      matches where the created note actually lands.
- [ ] **Note path preview** with **Folder** `Journals/{{note_name}}` → the preview
      resolves the folder instead of going blank.
- [ ] **Note path preview** with the **name template cleared** → the preview is replaced
      by the empty-note-name warning.
```

- [ ] **Step 2: Confirm the file is left unstaged**

Run:

```bash
git status --short docs/manual-testing-checklist-v3.md
```

Expected: ` M docs/manual-testing-checklist-v3.md` — a space in the first column (unstaged), not `M ` (staged). Report this to the repository owner rather than committing.
