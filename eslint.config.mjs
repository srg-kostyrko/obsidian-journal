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

export default [
  {
    ignores: ["**/build/**", "**/test-vault/**", "**/*.mjs", "**/__mocks__/**", "src/_old-code/**", "coverage/**"],
  },
  eslint.configs.recommended,
  ...tseslint.configs.strict,
  ...tseslint.configs.stylistic,
  ...tseslint.configs.recommendedTypeChecked,
  ...tseslint.configs.stylisticTypeChecked,
  cspellConfigs.recommended,
  eslintConfigPrettier,
  ...pluginVue.configs["flat/recommended"],
  eslintPluginUnicorn.configs.recommended,
  eslintComments.recommended,
  importX.flatConfigs.recommended,
  importX.flatConfigs.typescript,
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
        { replacements: { e: { event: false }, props: false, ref: false, attrs: false, i: false, env: false } },
      ],

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
    files: ["**/*.test.ts", "**/*.bench.ts"],
    plugins: { vitest },
    rules: {
      ...vitest.configs.recommended.rules,
      "@typescript-eslint/no-non-null-assertion": "off",
      "@typescript-eslint/unbound-method": "off",
      "unicorn/no-useless-undefined": "off",
      "no-restricted-syntax": "off",
    },
  },
];
