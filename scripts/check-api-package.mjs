// Compiles a realistic consumer against the built package. `check:types` only proves this
// repo compiles; nothing else proves the thing we publish is usable from TypeScript — which
// is how the package once shipped without a declaration for its own entry point.
import { execFileSync } from "node:child_process";
import { cpSync, mkdirSync, mkdtempSync, symlinkSync, writeFileSync } from "node:fs";
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
symlinkSync(join(root, "node_modules/obsidian"), join(modules, "obsidian"));

writeFileSync(
  join(scratch, "consumer.ts"),
  `import { getJournalsApi } from "obsidian-journals-api";
import type { JournalNote, JournalsApiErrorCode } from "obsidian-journals-api";
import type { App, TFile } from "obsidian";

export async function capture(app: App): Promise<TFile | null> {
  const journals = getJournalsApi(app);
  if (!journals) return null;

  const dailies = await journals.listJournals({ writeType: "day", shelf: null });
  const notes: readonly JournalNote[] = await journals.notesFor({ writeType: "day" }, "today");
  const off = journals.on("journalRenamed", ({ from, to }) => void [from, to]);
  off();

  try {
    const { note, created } = await journals.ensureNote(dailies[0]?.name ?? "Daily", "+1w", { confirm: false });
    return created ? note.file : null;
  } catch (error) {
    const code = (error as { code: JournalsApiErrorCode }).code;
    // The union is open, so a default branch must always compile.
    return code === "aborted" ? null : null;
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

console.log("api package: a consumer compiles against the published types");
