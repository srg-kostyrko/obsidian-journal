import eslint from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";
import eslintConfigPrettier from "eslint-config-prettier";
import pluginVue from "eslint-plugin-vue";
import vueParser from "vue-eslint-parser";
import eslintPluginUnicorn from "eslint-plugin-unicorn";
import cspellConfigs from "@cspell/eslint-plugin/configs";
import eslintComments from "@eslint-community/eslint-plugin-eslint-comments/configs";
import vitest from "@vitest/eslint-plugin";
import importX from "eslint-plugin-import-x";
import obsidianmd from "eslint-plugin-obsidianmd";
import mocha from "eslint-plugin-mocha";

const noRawError = {
  selector: "NewExpression[callee.name='Error']",
  message: "Throw a named Error subclass instead of raw `new Error()`.",
};

const noStrayDefineModal = {
  selector: "CallExpression[callee.name='defineModal']",
  message: "`defineModal()` is only allowed in `<feature>/ui/modals.ts`. Move the modal definition there.",
};

// `no-restricted-syntax` options replace rather than merge, so this array must carry
// the vi.mock selector too — a block that omits it lifts the isolation ban for every
// glob it covers, and a selector matching nothing looks exactly like one that works.
const campaignTestSelectors = [
  {
    selector: "CallExpression[callee.object.name='vi'][callee.property.name='mock']",
    message:
      "vi.mock replaces the module for every later file sharing the worker's registry. Rename this file to *.isolated.test.ts so it runs in its own.",
  },
  {
    selector: "NewExpression[callee.name='Container']",
    message: "Build the container with testContainer() from @/testing.",
  },
  {
    // Narrowed to a binding chain inside a test body. A bare `.register(` also names
    // JournalsIndex.register, the domain method the suite seeds index entries through.
    // The second branch covers the `it.each(...)(...)` / `describe.each(...)(...)` shape,
    // where the hook name sits one call deeper.
    selector:
      ":matches(CallExpression[callee.name=/^(it|test|beforeEach|beforeAll|afterEach|afterAll)$/], CallExpression[callee.callee.property.name='each']) MemberExpression[object.callee.property.name='register'][property.name=/^use(Value|Class|Factory|Existing)$/]",
    message: "Pass a feature CORE/UI module to testContainer({ modules }) instead of registering by hand.",
  },
  {
    selector:
      "FunctionDeclaration[id.name=/^(make|build|seed|create)(Journal|Command|View|Shelf|Decoration|Config|NavSegment|ToolbarItem)/]",
    message: "Entity fixtures live in the feature's testing.ts — use fixedJournal/customJournal/buildShelf.",
  },
  {
    // Conditioned on the file already building a harness, rather than banning the raw import
    // outright: a pure-tier component test whose component injects nothing needs no injector,
    // and an allowlist of those files would go stale silently (a stale `ignores` glob that
    // matches nothing is indistinguishable from a working one).
    selector:
      "Program:has(ImportDeclaration[source.value='@/testing']) ImportDeclaration[source.value='@testing-library/vue'] ImportSpecifier[imported.name='render']",
    message: "This file already builds a harness — mount through harness.render, which binds the injector for you.",
  },
];

// `initLocale()` runs inside `onload()`, long after the import graph has evaluated, so a message
// resolved at module scope freezes in the base locale for every user. Calls inside a function body
// (including arrows and getters) and class field initializers run later, so they are exempt.
// `.vue` files are exempt too: `<script setup>` bodies read as module scope in the AST but execute
// per component instance.
// `src/calendar/` owns every moment access. Banning the bare `moment` package alone left the
// loophole open, since Obsidian re-exports moment and that is how the plugin actually reaches it —
// so both specifiers are restricted, and `src/calendar/` is where the exemption lives.
const bareMomentImport = {
  name: "moment",
  message: "Import moment via the calendar abstraction; do not depend on moment directly.",
};

const obsidianMomentImport = {
  name: "obsidian",
  importNames: ["moment"],
  message:
    "Obsidian re-exports moment; reach it through the calendar abstraction instead — `localMoment()` for a date, `Calendar` for week config, `localeData()` for names and parse patterns.",
};

const momentImportPaths = [bareMomentImport, obsidianMomentImport];

// `NoteFileService` is the single place a raw `TFile` leaves the host layer, and it exists
// only so the public API can hand integrators one. Every other consumer takes the domain
// `Note` from `NotesService`; the exemption below is `src/api/` and the host itself.
const noteFileServiceImport = {
  group: ["**/host/internal/note-file-service"],
  message:
    "NoteFileService is the single TFile escape hatch and belongs to src/api only. Use NotesService and the domain `Note` instead.",
};

const noEagerMessage = {
  selector:
    "CallExpression[callee.object.name='m']:not(:function CallExpression):not(PropertyDefinition CallExpression)",
  message:
    "`m.*()` at module scope resolves to the base locale because `initLocale()` runs in `onload()`. Wrap it in a factory called at use time.",
};

// `Container.override` exists for the test host boundary (src/testing.ts) and is defined and
// tested under src/infrastructure/di/**; production wiring registers once, in a module. ESLint
// selectors can't see types, so this also matches any other object's `.override(...)` method —
// accepted, since none exists in this codebase today.
const noProductionOverride = {
  selector: "CallExpression[callee.property.name='override'][callee.object.type!='ThisExpression']",
  message: "Container.override exists for the test host boundary. Production wiring registers once, in a module.",
};

export default [
  {
    ignores: [
      "packages/**",
      "**/build/**",
      "**/test-vault/**",
      "**/perf-vault/**",
      "**/*.mjs",
      "**/*.json",
      "**/__mocks__/**",
      "src/i18n/paraglide/**",
      "coverage/**",
      ".obsidian-cache/**",
    ],
  },
  eslint.configs.recommended,
  ...tseslint.configs.strict,
  ...tseslint.configs.stylistic,
  ...tseslint.configs.recommendedTypeChecked,
  ...tseslint.configs.stylisticTypeChecked,
  cspellConfigs.recommended,
  eslintConfigPrettier,
  ...pluginVue.configs["flat/recommended"].map((cfg) => ({ ...cfg, files: cfg.files ?? ["**/*.vue"] })),
  eslintPluginUnicorn.configs.recommended,
  eslintComments.recommended,
  importX.flatConfigs.recommended,
  importX.flatConfigs.typescript,
  {
    settings: {
      "import-x/resolver": {
        typescript: { project: ["tsconfig.app.json", "tsconfig.node.json"], noWarnOnMultipleProjects: true },
      },
    },
  },
  ...obsidianmd.configs.recommended,
  {
    files: ["*.config.{ts,mts,cts}", "vite.config.mts", "vitest.config.mts"],
    rules: Object.fromEntries(Object.keys(obsidianmd.rules).map((rule) => [`obsidianmd/${rule}`, "off"])),
  },
  {
    languageOptions: {
      // `extraFileExtensions` must carry the same value for every linted file, `.vue` or not.
      // typescript-eslint pushes it to the project service per file, and any change calls
      // TypeScript's `reloadProjects()`, which rebuilds every open program from scratch —
      // so declaring it only on the `.vue` block makes each .ts/.vue alternation a full reload.
      parserOptions: { projectService: true, extraFileExtensions: [".vue"] },
      globals: { ...globals.node },
    },
  },
  {
    files: ["**/*.vue"],
    languageOptions: {
      parser: vueParser,
      parserOptions: {
        parser: tseslint.parser,
        projectService: true,
        extraFileExtensions: [".vue"],
      },
    },
    rules: {
      // Shell.vue is an intentional single-word architectural name; all other SFCs are multi-word.
      "vue/multi-word-component-names": ["error", { ignores: ["Shell"] }],
    },
  },
  {
    rules: {
      "no-console": "error",

      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
      "@typescript-eslint/no-dynamic-delete": "off",
      "@typescript-eslint/consistent-type-imports": ["error", { fixStyle: "inline-type-imports" }],
      "@typescript-eslint/no-import-type-side-effects": "error",

      "vue/max-attributes-per-line": "off",
      "vue/singleline-html-element-content-newline": "off",
      "vue/html-self-closing": "off",
      "vue/html-indent": "off",

      "unicorn/prefer-structured-clone": "off",
      "unicorn/filename-case": ["error", { cases: { kebabCase: true, pascalCase: true }, checkDirectories: false }],
      "unicorn/relative-url-style": ["error", "always"],
      "unicorn/no-unreadable-array-destructuring": "off",
      // Obsidian API surface uses `null` heavily; staying off is intentional.
      "unicorn/no-null": "off",
      "unicorn/name-replacements": [
        "error",
        {
          replacements: {
            e: { event: false },
            el: false,
            err: false,
            props: false,
            ref: false,
            attrs: false,
            i: false,
            env: false,
            fn: false,
            // `Repository` is the deliberate descriptive form; do not abbreviate to `Repo`.
            repository: false,
            // Abbreviations worth expanding, but renaming them collides with existing
            // `command`/`config`/`dependency` identifiers; deferred to a dedicated pass.
            cfg: false,
            cmd: false,
            dep: false,
          },
        },
      ],
      "unicorn/no-array-callback-reference": "off",
      "unicorn/prefer-global-this": "off",

      // Rules newly added to unicorn's recommended set (v65–v68) that are not adopted:
      // they impose stylistic opinions on a working codebase or fight deliberate patterns.
      "unicorn/no-this-outside-of-class": "off", // fights `attempt.in(this, function*)` do-notation
      "unicorn/no-nonstandard-builtin-properties": "off", // false positives on Symbol.dispose/asyncDispose
      "unicorn/prefer-iterator-to-array": "off", // Iterator#toArray() is ES2025; runtime-support risk
      "unicorn/prefer-await": "off", // Result/AsyncResult pipelines compose `.then`/`.catch` deliberately
      "unicorn/consistent-boolean-name": "off",
      "unicorn/max-nested-calls": "off",
      "unicorn/no-non-function-verb-prefix": "off",
      "unicorn/no-top-level-assignment-in-function": "off",
      "unicorn/no-declarations-before-early-exit": "off",
      "unicorn/no-break-in-nested-loop": "off",
      "unicorn/prefer-scoped-selector": "off",
      "unicorn/prefer-private-class-fields": "off",
      "unicorn/prefer-minimal-ternary": "off",
      // All `.sort()`/`.toSorted()` sites sort strings deliberately (folder/file/icon
      // pickers); the rule only catches numeric-sorted-as-string, of which there are none.
      "unicorn/require-array-sort-compare": "off",
      // `Number.parseInt(x, 10)` is used for its leniency/truncation; `Number()` is not equivalent.
      "unicorn/prefer-number-coercion": "off",
      // Replacing `===` chains with `.includes()` drops the union narrowing the call sites rely on.
      "unicorn/prefer-includes-over-repeated-comparisons": "off",

      // Rules newly added to unicorn's recommended set in v73, likewise not adopted:
      // `.then(onOk, onErr)` is the thenable contract AsyncResult implements, and moving
      // rejection handling into `.catch()` would also swallow throws from the ok handler.
      "unicorn/prefer-then-catch": "off",
      // Expanding one-line `/** … */` and `/* no-op */` into three lines fights the terse
      // comment style the codebase keeps.
      "unicorn/single-line-block-comment-style": "off",
      // Reordering `&&`/`||` operands by "simplicity" puts the incidental guard ahead of the
      // domain-meaningful check at every site it flags.
      "unicorn/prefer-simple-condition-first": "off",

      "no-restricted-imports": ["error", { paths: momentImportPaths, patterns: [noteFileServiceImport] }],
      "no-restricted-syntax": ["error", noRawError, noStrayDefineModal],

      "@eslint-community/eslint-comments/no-use": ["error", { allow: [] }],

      "import-x/no-cycle": "error",
      "import-x/order": [
        "error",
        {
          groups: ["builtin", "external", "internal", "parent", "sibling", "index", "object", "type"],
          pathGroups: [{ pattern: "@/**", group: "internal", position: "before" }],
          pathGroupsExcludedImportTypes: ["builtin"],
          "newlines-between": "always",
          alphabetize: { order: "asc", caseInsensitive: true },
        },
      ],
      "import-x/newline-after-import": "error",

      "@cspell/spellchecker": ["error", { checkComments: true, autoFix: false }],
    },
  },
  {
    // Plugin sources are what the locale-freeze guard protects; test and e2e modules are
    // imported by a runner that has already picked a locale. Container.override is defined
    // and tested under src/infrastructure/di/**, so that directory is exempt from the
    // override-ban selector below.
    files: ["src/**/*.ts"],
    ignores: ["src/infrastructure/di/**"],
    rules: {
      "no-restricted-syntax": ["error", noRawError, noStrayDefineModal, noEagerMessage, noProductionOverride],
    },
  },
  {
    // `.vue` files get the override ban too — nothing stops a component importing a
    // `Container` and calling `.override(...)` — but not `noEagerMessage`: a `<script setup>`
    // body reads as module scope in the AST but executes per component instance, so the rule
    // would be a guaranteed false positive here (see the exemption note above `noEagerMessage`).
    // `noRawError`/`noStrayDefineModal` are already enforced for `.vue` through the base rules
    // block above (it carries no `files` filter); repeating them here just keeps this block's
    // `no-restricted-syntax` array from silently dropping that enforcement, since flat config
    // rule values replace rather than merge.
    files: ["src/**/*.vue"],
    ignores: ["src/infrastructure/di/**"],
    rules: {
      "no-restricted-syntax": ["error", noRawError, noStrayDefineModal, noProductionOverride],
    },
  },
  {
    // e2e specs and the WebdriverIO config are not part of the plugin bundle:
    // Mocha drives them, `WebdriverIO` is an ambient type namespace, and `e2e`/
    // `wdio`/`conf` are intentional domain names, not abbreviations to expand.
    files: ["e2e/**/*.ts", "wdio.conf.mts"],
    plugins: { mocha },
    languageOptions: {
      globals: { ...globals.mocha, WebdriverIO: "readonly" },
    },
    rules: {
      ...mocha.configs.recommended.rules,
      ...Object.fromEntries(Object.keys(obsidianmd.rules).map((rule) => [`obsidianmd/${rule}`, "off"])),
      "unicorn/name-replacements": "off",
      // A forgotten `.only` silently shrinks the CI run, so fail the lint gate on it.
      "mocha/no-exclusive-tests": "error",
      "mocha/no-pending-tests": "error",
      // Timeouts are configured globally in wdio.conf.mts, never via `this.timeout()`
      // inside a spec, so arrow callbacks carry no `this`-binding hazard here.
      "mocha/no-mocha-arrows": "off",
    },
  },
  {
    // Shared e2e helper modules (not spec files) export surface builders, fixtures,
    // and parameterized suite runners. Turn off the mocha rules that only make sense
    // for top-level spec entry points.
    files: ["e2e/**/*.ts"],
    ignores: ["e2e/**/*.e2e.ts"],
    rules: {
      // Helper modules are not spec entry points; exports are their public API.
      "mocha/no-exports": "off",
    },
  },
  {
    files: ["e2e/**/*.e2e.ts"],
    rules: {
      // Suite-runner calls (e.g. assertDecorationMatrix()) inside describe are the
      // intended programmatic-suite pattern; no-setup-in-describe cannot distinguish
      // them from accidental setup, so it is disabled for spec files only.
      "mocha/no-setup-in-describe": "off",
    },
  },
  {
    files: [
      "**/*.test.ts",
      "**/*.bench.ts",
      "**/testing.ts",
      "**/testing/**",
      "vitest.setup.ts",
      "vitest.setup.shared.ts",
    ],
    plugins: { vitest },
    rules: {
      ...vitest.configs.recommended.rules,
      "@typescript-eslint/no-non-null-assertion": "off",
      "@typescript-eslint/unbound-method": "off",
      "@typescript-eslint/no-invalid-void-type": "off",
      "unicorn/no-useless-undefined": "off",
      // Test mocks push to capture arrays as fire-and-forget arrow bodies; the discarded
      // length return is harmless here, and production code keeps the rule's protection.
      "unicorn/no-return-array-push": "off",
      // Tests probe that monadic `Option.filter`/etc. ignore their return; not array methods.
      "unicorn/no-unused-array-method-return": "off",
      // `splice(0)` deliberately drains-and-snapshots a listener array mid-iteration.
      "unicorn/no-unnecessary-splice": "off",
      "no-restricted-syntax": "off",
      // Fixtures build dates directly, without the plugin's locale coupling.
      "no-restricted-imports": "off",
      // Obsidian's DOM API describes plugin runtime code. Test scaffolding builds detached
      // elements under happy-dom, where `createDiv`/`activeDocument` do not exist — and both
      // rules autofix, so `--fix` would rewrite a passing test into a ReferenceError.
      // `vitest.setup.ts` is the shim that defines those helpers, so it has to reach for
      // `document.createElement` itself.
      "obsidianmd/prefer-active-doc": "off",
      "obsidianmd/prefer-create-el": "off",
      "vitest/expect-expect": ["error", { assertFunctionNames: ["expect", "expectTypeOf", "expectOk", "expectErr"] }],
    },
  },
  {
    files: ["**/*.test.ts"],
    ignores: ["**/*.isolated.test.ts"],
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector: "CallExpression[callee.object.name='vi'][callee.property.name='mock']",
          message:
            "vi.mock replaces the module for every later file sharing the worker's registry. Rename this file to *.isolated.test.ts so it runs in its own.",
        },
      ],
    },
  },
  {
    // Must sit after the two test blocks above: rule options replace rather than merge.
    // Phase 3 finished converting every feature directory, so enrollment is now "all of src"
    // minus the two permanent carve-outs, rather than a hand-maintained glob list. A list would
    // have to grow a line for each new feature directory, and a directory nobody remembered to
    // add is indistinguishable from one that is enforced.
    // `src/infrastructure/**` is deliberately exempt and stays exempt: its host/di/flows
    // tests are what testContainer is built from, so converting them onto the harness
    // would test the harness through itself.
    files: ["src/**/*.test.ts"],
    ignores: ["**/*.isolated.test.ts", "src/infrastructure/**"],
    rules: {
      "no-restricted-syntax": ["error", ...campaignTestSelectors],
    },
  },
  {
    // moment is available transitively through the "obsidian" devDependency (which pins its own
    // "moment"), not declared directly; the ordinal round-trip test needs the real locale data
    // from these subpath imports for its assertions to mean anything.
    files: ["src/templates/kinds.isolated.test.ts"],
    rules: {
      "import/no-extraneous-dependencies": "off",
    },
  },
  {
    files: ["src/infrastructure/logger/console-sink.ts"],
    rules: {
      // ConsoleSink is the single, intentional bridge from LogSink to the
      // DevTools console; the global ban on console.* applies everywhere else.
      // `obsidianmd/rule-custom-message` wraps `no-console` in this plugin's
      // ruleset, so both must be off to silence the warning.
      "no-console": "off",
      "obsidianmd/rule-custom-message": "off",
    },
  },
  {
    files: ["src/infrastructure/result/async-result.ts"],
    rules: {
      // AsyncResult intentionally implements PromiseLike; `then` is the documented surface.
      "unicorn/no-thenable": "off",
    },
  },
  {
    // The two character classes here are copied byte-for-byte from Obsidian's own app.js so
    // this count matches the status bar exactly; rewriting the `\uXXXX` escapes to code point
    // escapes would defeat the point of a byte-for-byte transcription.
    files: ["src/infrastructure/host/internal/note-size.ts"],
    rules: {
      "unicorn/prefer-unicode-code-point-escapes": "off",
    },
  },
  {
    files: ["src/settings/legacy/old-shapes.ts"],
    rules: {
      // Frozen snapshot of legacy persisted shapes; `calendar.global` is a data
      // field name, not the JS global object the rule means to catch.
      "obsidianmd/no-global-this": "off",
    },
  },
  {
    // Modal definitions are what `noStrayDefineModal` exists to allow here, so this array drops it
    // — but flat-config rule values replace rather than merge, so every other selector has to be
    // repeated or it silently stops applying to these files.
    files: ["**/ui/modals.ts", "src/infrastructure/host/modals/**/*.ts"],
    rules: {
      "no-restricted-syntax": ["error", noRawError, noEagerMessage, noProductionOverride],
    },
  },
  {
    files: ["src/calendar/**/*.ts"],
    rules: {
      // The calendar module IS the abstraction, so `import { moment } from "obsidian"` belongs
      // here and nowhere else. The bare-package ban still applies.
      "no-restricted-imports": ["error", { paths: [bareMomentImport], patterns: [noteFileServiceImport] }],
    },
  },
  {
    files: ["src/**/*.vue"],
    ignores: ["src/**/ui/**"],
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector: "Program",
          message: "Vue SFCs must live under a <feature>/ui/ directory.",
        },
      ],
    },
  },
  {
    files: ["src/**/*.flow.ts", "src/**/*.flow.test.ts"],
    ignores: ["src/**/flows/**"],
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector: "Program",
          message: "Flow files (`*.flow.ts`) must live under a <feature>/flows/ directory.",
        },
      ],
    },
  },
  {
    files: ["src/**/*.ts"],
    ignores: ["**/*.test.ts", "**/*.bench.ts", "src/i18n/paraglide/**"],
    rules: {
      "unicorn/filename-case": ["error", { case: "kebabCase", checkDirectories: false }],
    },
  },
  {
    files: ["src/**/*.vue"],
    rules: {
      "unicorn/filename-case": ["error", { case: "pascalCase", checkDirectories: false }],
    },
  },
  {
    // The two directories the TFile escape hatch is for: the API that returns one, and the
    // host layer that owns it.
    files: ["src/api/**/*.ts", "src/infrastructure/host/**/*.ts"],
    rules: {
      "no-restricted-imports": ["error", { paths: momentImportPaths }],
    },
  },
  {
    // Copied verbatim into the published packages/api/index.d.ts, so it may reference
    // nothing a consumer does not have. The moment someone imports a branded type here,
    // the published types break at *their* typecheck, not ours.
    files: ["src/api/public-api.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["*", "!obsidian"],
              message:
                'public-api.ts is copied verbatim into the published .d.ts. Only `import type { TFile } from "obsidian"` is allowed.',
            },
          ],
        },
      ],
    },
  },
];
