import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vite";
import builtins from "builtin-modules";
import { viteStaticCopy } from "vite-plugin-static-copy";

const isWatch = process.argv.includes("--watch");

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    viteStaticCopy({
      targets: [
        {
          src: "manifest.json",
          dest: "",
        },
      ],
    }),
  ],
  build: {
    target: "esnext",
    sourcemap: false,
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
});
