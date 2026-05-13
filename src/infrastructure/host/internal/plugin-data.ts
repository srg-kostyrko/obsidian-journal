import { inject } from "@/infrastructure/di";
import { AsyncResult } from "@/infrastructure/result";

import { PluginDataIOError } from "../errors";

import { InternalPluginToken } from "./tokens";

export class PluginData {
  readonly #plugin = inject(InternalPluginToken);

  load(): AsyncResult<unknown, PluginDataIOError> {
    return AsyncResult.fromPromise(this.#plugin.loadData(), (cause) => new PluginDataIOError("load", cause));
  }

  save(data: unknown): AsyncResult<void, PluginDataIOError> {
    return AsyncResult.fromPromise(this.#plugin.saveData(data), (cause) => new PluginDataIOError("save", cause));
  }
}
