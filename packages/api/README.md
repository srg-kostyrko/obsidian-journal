# obsidian-journals-api

Types and a locator for the [Journals](https://github.com/srg-kostyrko/obsidian-journal)
Obsidian plugin's API. This package contains **no domain logic** — it describes the
surface the plugin exposes and helps you find it.

```sh
npm install obsidian-journals-api
```

## Usage

Call `getJournalsApi` at the point of use rather than caching it at load: there is no
readiness event, and reloading the plugin replaces the object.

```ts
import { getJournalsApi } from "obsidian-journals-api";

const journals = getJournalsApi(this.app);
if (!journals) return; // Journals is not installed or not enabled

// Journals allows several journals of the same kind, so reads fan out.
const notes = await journals.notesFor({ writeType: "day" }, "today");

// Writes resolve to exactly one note, asking the user when a selector is ambiguous.
const { note, created } = await journals.ensureNote({ writeType: "day" }, "today");
```

## There is no "the" daily note

Unlike Daily Notes or Periodic Notes, a vault can hold **several** journals of the same
write type. `notesFor` therefore returns an array, and `ensureNote` shows the journal
picker when more than one matches. Coming from `obsidian-daily-notes-interface`? See the
migration table in the plugin's [`docs/plugin-api.md`](https://github.com/srg-kostyrko/obsidian-journal/blob/main/docs/plugin-api.md).

## Versioning

`api.apiVersion` is an integer, bumped only on a breaking change; this package's **major**
tracks it, so `obsidian-journals-api@1.x` describes `apiVersion 1`. Additive changes —
including **new error codes** — never move it, so always handle the default case when
branching on `error.code`.

Full reference: [`docs/plugin-api.md`](https://github.com/srg-kostyrko/obsidian-journal/blob/main/docs/plugin-api.md).
