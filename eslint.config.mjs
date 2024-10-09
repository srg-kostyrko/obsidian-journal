import eslint from "@eslint/js";
import tseslint from "typescript-eslint";
import eslintConfigPrettier from "eslint-config-prettier";
import pluginVue from "eslint-plugin-vue";
import eslintPluginUnicorn from "eslint-plugin-unicorn";

export default [
  {
    ignores: ["**/build/**", "**/test-vault/**", "**.mjs", "__mocks__/**", "src/_old-code/**"],
  },
  eslint.configs.recommended,
  ...tseslint.configs.strict,
  ...tseslint.configs.stylistic,
  eslintConfigPrettier,
  ...pluginVue.configs["flat/recommended"],
  eslintPluginUnicorn.configs["flat/recommended"],
  {
    rules: {
      "no-console": [
        "error",
        {
          allow: ["warn", "error"],
        },
      ],

      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
        },
      ],
      "@typescript-eslint/no-dynamic-delete": "off",
      "vue/max-attributes-per-line": "off",
      "vue/singleline-html-element-content-newline": "off",
      "vue/html-self-closing": "off",
      "unicorn/prefer-structured-clone": "off",
      "unicorn/filename-case": [
        "error",
        {
          cases: {
            kebabCase: true,
            pascalCase: true,
          },
        },
      ],
      "unicorn/relative-url-style": ["error", "always"],
      "unicorn/no-null": "off", // TODO consider enabling
      "unicorn/prevent-abbreviations": [
        "error",
        {
          replacements: {
            e: {
              event: false,
            },
            props: false,
            ref: false,
            attrs: false,
            i: false,
            env: false,
          },
        },
      ],
    },
  },
  {
    languageOptions: {
      parserOptions: {
        parser: tseslint.parser,
        projectService: true,
        extraFileExtensions: [".vue"],
      },
    },
  },
];
