// Prints a release's changelog section, ready for `gh release edit --notes-file`. The runbook used
// to do this with ad-hoc awk per release, which is how 3.5.0's notes needed a stray blank line
// stripped by hand after the fact.
import { readFileSync } from "node:fs";
import { parseArgs } from "node:util";
import { releaseNotes, releaseSections } from "./changelog.mjs";

const {
  values: { file },
  positionals,
} = parseArgs({
  options: { file: { type: "string", default: "CHANGELOG.md" } },
  allowPositionals: true,
});

const version = positionals.at(0);
if (version === undefined) {
  console.error("usage: node scripts/release-notes.mjs <version> [--file CHANGELOG.md]");
  process.exit(2);
}

const text = readFileSync(file, "utf8");
const notes = releaseNotes(text, version);
if (notes === null) {
  const known = releaseSections(text)
    .map((section) => section.version)
    .slice(0, 5)
    .join(", ");
  console.error(`${file} has no '## [${version}]' section. Newest sections: ${known}`);
  process.exit(1);
}

process.stdout.write(notes + "\n");
