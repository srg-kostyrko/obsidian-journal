// A blank line between two bullets renders the whole list loose, so one stray line changes how a
// release section reads on GitHub and in its published notes. 3.5.0 shipped with one and it is
// still in the file; nothing else in the pipeline looks at CHANGELOG.md's shape.
import { readFileSync } from "node:fs";
import { parseArgs } from "node:util";
import { looseListLines } from "./changelog.mjs";

const {
  values: { file },
} = parseArgs({
  options: { file: { type: "string", default: "CHANGELOG.md" } },
});

const findings = looseListLines(readFileSync(file, "utf8"));
for (const { lineno, version } of findings) {
  console.log(`LOOSE LIST: ${file}:${lineno} -> blank line between bullets in [${version}]`);
}

console.log(`${findings.length} loose list line(s)`);
process.exit(findings.length > 0 ? 1 : 0);
