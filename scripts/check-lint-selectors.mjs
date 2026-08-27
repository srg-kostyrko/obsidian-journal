// `no-restricted-syntax` options replace rather than merge, so a later config block that
// re-lists four of five campaign selectors silently lifts the fifth for every path it matches
// — and a selector that matches nothing looks exactly like one that works. Both failure modes
// are invisible to `npm run check:lint`, which only ever reports what a rule *did* catch.
//
// Two checks live here:
//   REACH — which campaign selectors the resolved config applies to a given path.
//   MATCH — whether each selector fires on the syntax it names, and stays quiet next door.
//
// MATCH replaces the ritual of writing a throwaway `*.test.ts` into `src/` to see a selector
// fire and then deleting it. It runs the selectors through a bare parser rather than the real
// config, because the config's project service refuses a path that is not in a tsconfig — the
// selectors are syntactic, so no type information is needed to decide what they match.
import { ESLint, Linter } from "eslint";
import tsParser from "@typescript-eslint/parser";
import { campaignTestSelectors, harnessTestSelectors, noViMock } from "../eslint.config.mjs";

const failures = [];

// REACH below compares the resolved config against the exported arrays, so it follows an edit
// to those arrays instead of catching it: move `noViMock` into `harnessTestSelectors` and both
// sides of that comparison shift together. The one property worth stating independently is
// therefore spelled out here as a literal, not derived from the arrays it checks.
const VI_MOCK = "callee.property.name='mock'";
const bans = (entries) => entries.some((entry) => entry.selector.includes(VI_MOCK));

if (!bans(campaignTestSelectors))
  failures.push(
    "COMPOSITION campaignTestSelectors no longer carries the vi.mock ban — every non-isolated glob lost it",
  );
if (bans(harnessTestSelectors))
  failures.push("COMPOSITION harnessTestSelectors carries the vi.mock ban — `.isolated` files exist to call vi.mock");
if (campaignTestSelectors.length !== harnessTestSelectors.length + 1)
  failures.push(
    `COMPOSITION the two sets must differ by exactly the vi.mock ban, but campaign has ${campaignTestSelectors.length} and harness has ${harnessTestSelectors.length}`,
  );

const REACH = [
  {
    path: "src/journals/journal-service.test.ts",
    expect: campaignTestSelectors,
    bansViMock: true,
    why: "an ordinary feature test carries the full campaign set",
  },
  {
    path: "src/journals/journal-service.isolated.test.ts",
    expect: harnessTestSelectors,
    bansViMock: false,
    why: "the `.isolated` suffix buys `vi.mock` and nothing else",
  },
  {
    path: "src/infrastructure/host/workspace-service.test.ts",
    expect: [noViMock],
    bansViMock: true,
    why: "infrastructure is exempt from the campaign set but not from the isolation ban",
  },
  {
    path: "src/infrastructure/host/internal/notice-service.isolated.test.ts",
    expect: [],
    bansViMock: false,
    why: "an isolated infrastructure test is exempt from both",
  },
  {
    path: "src/journals/journal-service.ts",
    expect: [],
    bansViMock: false,
    why: "no campaign selector may reach production source",
  },
];

const eslint = new ESLint({ cwd: process.cwd() });
const campaignSelectors = new Set(campaignTestSelectors.map((entry) => entry.selector));

for (const { path, expect, bansViMock, why } of REACH) {
  const config = await eslint.calculateConfigForFile(path);
  const [, ...applied] = config.rules["no-restricted-syntax"] ?? ["error"];
  const reached = applied.map((entry) => entry.selector).filter((selector) => campaignSelectors.has(selector));
  const wanted = expect.map((entry) => entry.selector);
  const missing = wanted.filter((selector) => !reached.includes(selector));
  const extra = reached.filter((selector) => !wanted.includes(selector));
  for (const selector of missing) failures.push(`REACH ${path}\n  ${why}\n  never reached it: ${selector}`);
  for (const selector of extra) failures.push(`REACH ${path}\n  ${why}\n  reached it anyway: ${selector}`);
  if (bans(applied) !== bansViMock)
    failures.push(
      `REACH ${path}\n  ${why}\n  the vi.mock ban should ${bansViMock ? "reach" : "not reach"} this path, and does ${bans(applied) ? "" : "not "}`,
    );
}

// Each entry names one campaign selector and pairs the syntax it exists to catch with the
// nearest syntax it must leave alone. A `quiet` case that starts failing is the useful half:
// it means a widened selector has begun firing on legitimate code.
const MATCH = [
  {
    selector: noViMock.selector,
    fires: `vi.mock("@/calendar");`,
    quiet: `const spy = vi.mocked(clock);`,
  },
  {
    selector: "NewExpression[callee.name='Container']",
    fires: `const container = new Container();`,
    quiet: `const seen = new Map();`,
  },
  {
    selector: "MemberExpression[object.callee.property.name='register']",
    fires: `beforeEach(() => { container.register(ClockToken).useValue(clock); });`,
    // JournalsIndex.register is the domain method the suite seeds index entries through,
    // which is why the selector is narrowed to a `.useX()` binding chain inside a hook.
    quiet: `beforeEach(() => { index.register(entry); });`,
  },
  {
    selector: "FunctionDeclaration[id.name=/^(make|build|seed|create)",
    fires: `function buildShelf() {}`,
    quiet: `function buildHarness() {}`,
  },
  {
    selector: "ImportSpecifier[imported.name='render']",
    fires: `import { testContainer } from "@/testing";\nimport { render } from "@testing-library/vue";`,
    quiet: `import { render } from "@testing-library/vue";`,
  },
];

const linter = new Linter();
const lint = (code) =>
  linter
    .verify(code, {
      languageOptions: { parser: tsParser, parserOptions: { ecmaVersion: "latest", sourceType: "module" } },
      rules: { "no-restricted-syntax": ["error", ...campaignTestSelectors] },
    })
    .map((message) => message.message);

for (const { selector, fires, quiet } of MATCH) {
  const entry = campaignTestSelectors.find((candidate) => candidate.selector.includes(selector));
  if (!entry) {
    failures.push(`MATCH no campaign selector contains ${selector} — this table is out of date`);
    continue;
  }
  if (!lint(fires).includes(entry.message))
    failures.push(`MATCH selector did not fire on the syntax it names\n  ${entry.selector}\n  ${fires}`);
  if (lint(quiet).includes(entry.message))
    failures.push(`MATCH selector fired on syntax it must leave alone\n  ${entry.selector}\n  ${quiet}`);
}

for (const failure of failures) console.error(`${failure}\n`);

if (failures.length > 0) {
  console.error(`${failures.length} lint-selector violation(s). See the campaign block in eslint.config.mjs.`);
  process.exit(1);
}
console.log(`lint selectors: ${REACH.length} paths, ${MATCH.length} selectors, no violations`);
