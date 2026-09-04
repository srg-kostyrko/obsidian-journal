// Compiles a realistic consumer against the built package. `check:types` only proves this
// repo compiles; nothing else proves the thing we publish is usable from TypeScript — which
// is how the package once shipped without a declaration for its own entry point.
import { execFileSync } from "node:child_process";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const scratch = mkdtempSync(join(tmpdir(), "journals-api-check-"));
const modules = join(scratch, "node_modules");
const installed = join(modules, "obsidian-journals-api");

mkdirSync(installed, { recursive: true });
for (const file of ["index.d.ts", "index.js", "package.json"]) {
  cpSync(join(root, "packages/api", file), join(installed, file));
}
// The consumer supplies the peers, so model that rather than pretending they are absent —
// and separately assert the package actually declares everything its types reach for.
symlinkSync(join(root, "node_modules/obsidian"), join(modules, "obsidian"));

const types = readFileSync(join(root, "packages/api/index.d.ts"), "utf8");
const manifest = JSON.parse(readFileSync(join(root, "packages/api/package.json"), "utf8"));
const declared = new Set([
  ...Object.keys(manifest.dependencies ?? {}),
  ...Object.keys(manifest.peerDependencies ?? {}),
]);
const referenced = new Set([...types.matchAll(/(?:from|import\()\s*"([^."][^"]*)"/g)].map((match) => match[1]));
const undeclared = [...referenced].filter((name) => !declared.has(name));
if (undeclared.length > 0) {
  throw new Error(
    `packages/api/index.d.ts references ${undeclared.join(", ")}, which packages/api/package.json ` +
      "does not declare as a dependency or peerDependency. A consumer without it cannot resolve the types.",
  );
}

writeFileSync(
  join(scratch, "consumer.ts"),
  `import { getJournalsApi } from "obsidian-journals-api";
import type { JournalNote, JournalsApiErrorCode, NoteletNote } from "obsidian-journals-api";
import type { App, TFile } from "obsidian";

export async function capture(app: App): Promise<TFile | null> {
  const journals = getJournalsApi(app);
  if (!journals) return null;

  const dailies = await journals.listJournals({ writeType: "day", shelf: null });
  const notes: readonly JournalNote[] = await journals.notesFor({ writeType: "day" }, "today");
  const off = journals.on("journalRenamed", ({ from, to }) => void [from, to]);
  off();

  const types: readonly string[] = dailies[0]?.notelets ?? [];
  const meetings: readonly NoteletNote[] = await journals.noteletsFor("Daily", "today", {
    type: types[0] ?? "Meeting",
  });
  const offNotelets = journals.on("noteletAdded", ({ journal, date, type, path }) =>
    void [journal, date, type, path],
  );
  offNotelets();
  if (meetings[0]) await journals.openNotelet(meetings[0], { openMode: "tab" });

  try {
    const { note, created } = await journals.ensureNote(dailies[0]?.name ?? "Daily", "+1w", { confirm: false });
    const notelet: NoteletNote = await journals.createNotelet("Daily", "today", "Meeting", { prompt: false });
    const held: NoteletNote | null = await journals.noteletOf(notelet.file);
    void [notes, held?.counter, notelet.displayDate];
    return created ? note.file : null;
  } catch (error) {
    const code = (error as { code: JournalsApiErrorCode }).code;
    // The union is open, so a default branch must always compile.
    return code === "notelet-type-not-found" ? null : null;
  }
}
`,
);

execFileSync(
  process.execPath,
  [
    join(root, "node_modules/typescript/bin/tsc"),
    "--noEmit",
    "--strict",
    "--skipLibCheck",
    "--moduleResolution",
    "bundler",
    "--module",
    "esnext",
    "--target",
    "es2022",
    "consumer.ts",
  ],
  // From the scratch dir so tsc does not pick up this repo's tsconfig.json.
  { stdio: "inherit", cwd: scratch },
);

console.log("api package: declares its peers, and a consumer compiles against the published types");
