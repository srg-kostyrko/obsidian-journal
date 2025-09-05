import eslint from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";
import eslintConfigPrettier from "eslint-config-prettier";
import pluginVue from "eslint-plugin-vue";
import eslintPluginUnicorn from "eslint-plugin-unicorn";
import cspellConfigs from "@cspell/eslint-plugin/configs";

export default [
  { ignores: ["**/build/**", "**/test-vault/**", "**.mjs", "__mocks__/**", "src/_old-code/**", "coverage/**"] },
  eslint.configs.recommended,
  ...tseslint.configs.strict,
  ...tseslint.configs.stylistic,
  ...tseslint.configs.recommendedTypeChecked,
  ...tseslint.configs.stylisticTypeChecked,
  cspellConfigs.recommended,
  eslintConfigPrettier,
  ...pluginVue.configs["flat/recommended"],
  eslintPluginUnicorn.configs["recommended"],
  {
    rules: {
      "no-console": ["error", { allow: ["warn", "error"] }],

      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
      "@typescript-eslint/no-dynamic-delete": "off",
      "@typescript-eslint/no-unsafe-argument": "off",
      "@typescript-eslint/no-unsafe-member-access": "off",
      "@typescript-eslint/no-unsafe-assignment": "off",
      "@typescript-eslint/no-unsafe-return": "off",
      "vue/max-attributes-per-line": "off",
      "vue/singleline-html-element-content-newline": "off",
      "vue/html-self-closing": "off",
      "vue/html-indent": "off",
      "unicorn/prefer-structured-clone": "off",
      "unicorn/filename-case": ["error", { cases: { kebabCase: true, pascalCase: true } }],
      "unicorn/relative-url-style": ["error", "always"],
      "unicorn/no-unreadable-array-destructuring": "off",
      "unicorn/no-null": "off", // TODO consider enabling
      "unicorn/prevent-abbreviations": [
        "error",
        {
          replacements: {
            e: { event: false },
            props: false,
            ref: false,
            attrs: false,
            i: false,
            env: false,
            args: false,
            fn: false,
          },
        },
      ],
      "@cspell/spellchecker": [
        "warn",
        {
          checkComments: true,
          autoFix: false,
          cspell: { words: ["Keymap", "templater", "chrono", "iconed", "popout"] },
        },
      ],
    },
  },
  {
    languageOptions: {
      parserOptions: { parser: tseslint.parser, projectService: true, extraFileExtensions: [".vue"] },
      globals: { ...globals.node },
    },
  },
];
