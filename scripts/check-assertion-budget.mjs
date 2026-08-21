import { readFileSync, writeFileSync } from "node:fs";
import { readdir } from "node:fs/promises";
import { join, relative } from "node:path";

const ROOT = new URL("..", import.meta.url).pathname;
const SRC = join(ROOT, "src");
const BASELINE = join(ROOT, "assertion-budget.json");
const ASSERTION = /\b(?:expect|expectTypeOf|expectOk|expectErr)\s*\(/g;

async function testFiles(dir) {
  const out = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await testFiles(full)));
    else if (entry.name.endsWith(".test.ts")) out.push(full);
  }
  return out;
}

// One bucket per top-level feature directory under src/. Finer granularity would make every
// file move look like a budget change; coarser would let a whole feature's assertions vanish.
function bucketOf(file) {
  return relative(SRC, file).split("/")[0];
}

async function collect() {
  const counts = {};
  for (const file of await testFiles(SRC)) {
    const found = readFileSync(file, "utf8").match(ASSERTION)?.length ?? 0;
    const bucket = bucketOf(file);
    counts[bucket] = (counts[bucket] ?? 0) + found;
  }
  return Object.fromEntries(Object.entries(counts).sort(([a], [b]) => a.localeCompare(b)));
}

const actual = await collect();

if (process.argv.includes("--write")) {
  writeFileSync(BASELINE, `${JSON.stringify(actual, null, 2)}\n`);
  console.log(`Wrote baseline for ${Object.keys(actual).length} buckets.`);
  process.exit(0);
}

const baseline = JSON.parse(readFileSync(BASELINE, "utf8"));
const shortfalls = Object.entries(baseline)
  .map(([bucket, expected]) => ({ bucket, expected, found: actual[bucket] ?? 0 }))
  .filter(({ expected, found }) => found < expected);

if (shortfalls.length > 0) {
  console.error("Assertion budget shortfall:\n");
  for (const { bucket, expected, found } of shortfalls) {
    console.error(`  ${bucket}: ${found} assertions, baseline ${expected} (-${expected - found})`);
  }
  console.error(
    "\nIf the reduction is intended, run `npm run check:assertions -- --write` and commit the" +
      "\nupdated assertion-budget.json alongside the change that justifies it.",
  );
  process.exit(1);
}

console.log(`Assertion budget met across ${Object.keys(baseline).length} buckets.`);
