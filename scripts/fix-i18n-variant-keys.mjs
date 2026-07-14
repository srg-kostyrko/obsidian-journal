// The inlang machine-translate CLI re-serializes match-variant keys with a
// space after each comma (`type=a, writeType=b`). Paraglide parses selector
// names by splitting those keys on `,` without trimming, so the spaces leak
// into the generated input parameter names (` writeType`) and break the types.
// This normalizes every messages/*.json match key back to the comma-only form.
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const dir = "messages";
const despaceKey = (key) =>
  key
    .split(",")
    .map((part) => part.trim())
    .join(",");

let changedFiles = 0;
for (const file of readdirSync(dir).filter((f) => f.endsWith(".json"))) {
  const path = join(dir, file);
  const data = JSON.parse(readFileSync(path, "utf8"));
  let changed = false;
  for (const value of Object.values(data)) {
    if (!Array.isArray(value)) continue;
    for (const variant of value) {
      if (!variant || typeof variant !== "object" || !variant.match) continue;
      const fixed = {};
      for (const [key, pattern] of Object.entries(variant.match)) {
        const nextKey = despaceKey(key);
        if (nextKey !== key) changed = true;
        fixed[nextKey] = pattern;
      }
      variant.match = fixed;
    }
  }
  if (changed) {
    writeFileSync(path, `${JSON.stringify(data, null, "\t")}\n`);
    changedFiles++;
  }
}
console.log(`normalized match keys in ${changedFiles} file(s)`);
