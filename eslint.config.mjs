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

const noEagerMessage = {
  selector:
    "CallExpression[callee.object.name='m']:not(:function CallExpression):not(PropertyDefinition CallExpression)",
  message:
    "`m.*()` at module scope resolves to the base locale because `initLocale()` runs in `onload()`. Wrap it in a factory called at use time.",
};

export default [
  {
    ignores: [
      "**/build/**",
      "**/test-vault/**",
      "**/perf-vault/**",
      "**/*.mjs",
      "**/*.json",
      "**/__mocks__/**",
      "src/_old-code/**",
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
      parserOptions: { projectService: true },
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

      "no-restricted-imports": ["error", { paths: momentImportPaths }],
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
    // imported by a runner that has already picked a locale.
    files: ["src/**/*.ts"],
    rules: {
      "no-restricted-syntax": ["error", noRawError, noStrayDefineModal, noEagerMessage],
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
    files: ["**/*.test.ts", "**/*.bench.ts", "**/testing.ts", "**/testing/**"],
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
      "obsidianmd/prefer-active-doc": "off",
      "obsidianmd/prefer-create-el": "off",
      "vitest/expect-expect": ["error", { assertFunctionNames: ["expect", "expectTypeOf", "expectOk", "expectErr"] }],
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
    files: ["src/settings/legacy/old-shapes.ts"],
    rules: {
      // Frozen snapshot of legacy persisted shapes; `calendar.global` is a data
      // field name, not the JS global object the rule means to catch.
      "obsidianmd/no-global-this": "off",
    },
  },
  {
    files: ["**/ui/modals.ts", "src/infrastructure/host/modals/**/*.ts"],
    rules: {
      "no-restricted-syntax": ["error", noRawError, noEagerMessage],
    },
  },
  {
    files: ["src/calendar/**/*.ts"],
    rules: {
      // The calendar module IS the abstraction, so `import { moment } from "obsidian"` belongs
      // here and nowhere else. The bare-package ban still applies.
      "no-restricted-imports": ["error", { paths: [bareMomentImport] }],
    },
  },
  {
    files: ["src/**/*.vue"],
    ignores: ["src/**/ui/**", "src/_old-code/**"],
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
    ignores: ["src/**/flows/**", "src/_old-code/**"],
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
    ignores: ["**/*.test.ts", "**/*.bench.ts", "src/_old-code/**", "src/i18n/paraglide/**"],
    rules: {
      "unicorn/filename-case": ["error", { case: "kebabCase", checkDirectories: false }],
    },
  },
  {
    files: ["src/**/*.vue"],
    ignores: ["src/_old-code/**"],
    rules: {
      "unicorn/filename-case": ["error", { case: "pascalCase", checkDirectories: false }],
    },
  },
];
