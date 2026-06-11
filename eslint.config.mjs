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

export default [
  {
    ignores: [
      "**/build/**",
      "**/test-vault/**",
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
      "unicorn/filename-case": ["error", { cases: { kebabCase: true, pascalCase: true } }],
      "unicorn/relative-url-style": ["error", "always"],
      "unicorn/no-unreadable-array-destructuring": "off",
      // Obsidian API surface uses `null` heavily; staying off is intentional.
      "unicorn/no-null": "off",
      "unicorn/prevent-abbreviations": [
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
          },
        },
      ],
      "unicorn/no-array-callback-reference": "off",
      "unicorn/prefer-global-this": "off",

      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "moment",
              message: "Import moment via the calendar abstraction; do not depend on moment directly.",
            },
          ],
        },
      ],
      "no-restricted-syntax": [
        "error",
        {
          selector: "NewExpression[callee.name='Error']",
          message: "Throw a named Error subclass instead of raw `new Error()`.",
        },
        {
          selector: "CallExpression[callee.name='defineModal']",
          message: "`defineModal()` is only allowed in `<feature>/ui/modals.ts`. Move the modal definition there.",
        },
      ],

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
      "unicorn/prevent-abbreviations": "off",
      // A forgotten `.only` silently shrinks the CI run, so fail the lint gate on it.
      "mocha/no-exclusive-tests": "error",
      "mocha/no-pending-tests": "error",
      // Timeouts are configured globally in wdio.conf.mts, never via `this.timeout()`
      // inside a spec, so arrow callbacks carry no `this`-binding hazard here.
      "mocha/no-mocha-arrows": "off",
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
      "no-restricted-syntax": "off",
      "obsidianmd/prefer-active-doc": "off",
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
      "no-restricted-syntax": [
        "error",
        {
          selector: "NewExpression[callee.name='Error']",
          message: "Throw a named Error subclass instead of raw `new Error()`.",
        },
      ],
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
      "unicorn/filename-case": ["error", { case: "kebabCase" }],
    },
  },
  {
    files: ["src/**/*.vue"],
    ignores: ["src/_old-code/**"],
    rules: {
      "unicorn/filename-case": ["error", { case: "pascalCase" }],
    },
  },
];
