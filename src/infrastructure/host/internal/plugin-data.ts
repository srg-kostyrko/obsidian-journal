import { inject } from "@/infrastructure/di";
import { AsyncResult } from "@/infrastructure/result";

import { PluginDataIOError } from "../errors";

import { InternalObsidianAppToken, InternalPluginToken } from "./tokens";

// A name with any separator would let a caller write outside the plugin's own directory.
const SAFE_NAME = /^[\w.-]+$/;

export class PluginData {
  readonly #plugin = inject(InternalPluginToken);
  readonly #app = inject(InternalObsidianAppToken);

  #pathFor(name: string): string | undefined {
    if (!SAFE_NAME.test(name) || name === "." || name === "..") return undefined;
    const directory = this.#plugin.manifest.dir;
    return directory === undefined ? undefined : `${directory}/${name}`;
  }

  load(): AsyncResult<unknown, PluginDataIOError> {
    return AsyncResult.fromPromise(this.#plugin.loadData(), (cause) => new PluginDataIOError("load", cause));
  }

  save(data: unknown): AsyncResult<void, PluginDataIOError> {
    return AsyncResult.fromPromise(this.#plugin.saveData(data), (cause) => new PluginDataIOError("save", cause));
  }

  listFiles(): AsyncResult<string[], PluginDataIOError> {
    const directory = this.#plugin.manifest.dir;
    if (directory === undefined) {
      return AsyncResult.err(new PluginDataIOError("list", { message: "no plugin directory" }));
    }
    return AsyncResult.fromPromise(
      this.#app.vault.adapter
        .list(directory)
        .then((listing) => listing.files.map((file) => file.slice(directory.length + 1))),
      (cause) => new PluginDataIOError("list", cause),
    );
  }

  readFile(name: string): AsyncResult<string, PluginDataIOError> {
    const path = this.#pathFor(name);
    if (path === undefined) {
      return AsyncResult.err(new PluginDataIOError("read-file", { message: `bad name ${name}` }));
    }
    return AsyncResult.fromPromise(
      this.#app.vault.adapter.read(path),
      (cause) => new PluginDataIOError("read-file", cause),
    );
  }

  writeFile(name: string, contents: string): AsyncResult<void, PluginDataIOError> {
    const path = this.#pathFor(name);
    if (path === undefined) {
      return AsyncResult.err(new PluginDataIOError("write-file", { message: `bad name ${name}` }));
    }
    return AsyncResult.fromPromise(
      this.#app.vault.adapter.write(path, contents),
      (cause) => new PluginDataIOError("write-file", cause),
    );
  }

  deleteFile(name: string): AsyncResult<void, PluginDataIOError> {
    const path = this.#pathFor(name);
    if (path === undefined) {
      return AsyncResult.err(new PluginDataIOError("delete-file", { message: `bad name ${name}` }));
    }
    return AsyncResult.fromPromise(
      this.#app.vault.adapter.remove(path),
      (cause) => new PluginDataIOError("delete-file", cause),
    );
  }
}
