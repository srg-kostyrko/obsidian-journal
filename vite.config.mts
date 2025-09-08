/* eslint-disable @cspell/spellchecker */
import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vite";
import builtins from "builtin-modules";
import { viteStaticCopy } from "vite-plugin-static-copy";
import vue from "@vitejs/plugin-vue";

const isWatch = process.argv.includes("--watch");

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  plugins: [
    vue(),
    viteStaticCopy({
      targets: [
        {
          src: "manifest.json",
          dest: "",
        },
      ],
    }),
  ],
  define: {
    "process.env.NODE_ENV": JSON.stringify(mode),
  },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  build: {
    target: "ES2022",
    sourcemap: isWatch ? "inline" : false,
    minify: !isWatch,
    commonjsOptions: {
      ignoreTryCatch: false,
    },
    lib: {
      entry: fileURLToPath(new URL("./src/main.ts", import.meta.url)),
      formats: ["cjs"],
    },
    rollupOptions: {
      output: {
        entryFileNames: "main.js",
        assetFileNames: "styles.css",
        exports: "named",
      },
      external: [
        "obsidian",
        "electron",
        "codemirror",
        "@codemirror/autocomplete",
        "@codemirror/closebrackets",
        "@codemirror/collab",
        "@codemirror/commands",
        "@codemirror/comment",
        "@codemirror/fold",
        "@codemirror/gutter",
        "@codemirror/highlight",
        "@codemirror/history",
        "@codemirror/language",
        "@codemirror/lint",
        "@codemirror/matchbrackets",
        "@codemirror/panel",
        "@codemirror/rangeset",
        "@codemirror/rectangular-selection",
        "@codemirror/search",
        "@codemirror/state",
        "@codemirror/stream-parser",
        "@codemirror/text",
        "@codemirror/tooltip",
        "@codemirror/view",
        "@lezer/common",
        "@lezer/lr",
        "@lezer/highlight",
        ...builtins,
      ],
    },
    emptyOutDir: false,
    outDir: isWatch ? "test-vault/.obsidian/plugins/journals" : "build",
  },
}));
