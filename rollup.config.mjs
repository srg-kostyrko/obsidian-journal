import nodeResolve from "@rollup/plugin-node-resolve";
import commonjs from "@rollup/plugin-commonjs";
import copy from "rollup-plugin-copy";
import typescript2 from "rollup-plugin-typescript2";

const BASE_CONFIG = {
  input: "src/main.ts",
  external: ["obsidian", "@codemirror/view", "@codemirror/state", "@codemirror/language"],
};

const getRollupPlugins = (...plugins) => [typescript2(), nodeResolve({ browser: true }), commonjs()].concat(plugins);

const DEV_PLUGIN_CONFIG = {
  ...BASE_CONFIG,
  output: {
    dir: "test-vault/.obsidian/plugins/journals",
    sourcemap: "inline",
    format: "cjs",
    exports: "default",
    name: "Journals (Development)",
  },
  plugins: getRollupPlugins(
    copy({
      targets: [
        { src: "manifest.json", dest: "test-vault/.obsidian/plugins/journals/" },
        { src: "styles.css", dest: "test-vault/.obsidian/plugins/journals/" },
      ],
    }),
  ),
};

const PROD_PLUGIN_CONFIG = {
  ...BASE_CONFIG,
  output: {
    dir: "build",
    sourcemap: false,
    format: "cjs",
    exports: "default",
    name: "Dataview (Production)",
  },
  plugins: getRollupPlugins(),
};

let configs = [];
if (process.env.BUILD === "production") {
  // Production build, build library and main plugin.
  configs.push(PROD_PLUGIN_CONFIG);
} else {
  // Default to the dev build.
  configs.push(DEV_PLUGIN_CONFIG);
}

export default configs;
