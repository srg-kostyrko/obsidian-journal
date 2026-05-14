import * as v from "valibot";
import { reactive, ref, type Ref } from "vue";

import type { SettingsNotice } from "./notices";
import type { SliceDefinition } from "./schema";
import type { SliceHandle } from "./types";
import type { BaseIssue, BaseSchema, InferOutput } from "valibot";

type AnySchema = BaseSchema<unknown, unknown, BaseIssue<unknown>>;

export class ReactiveSlice<TSchema extends AnySchema> implements SliceHandle<InferOutput<TSchema>> {
  readonly state: InferOutput<TSchema>;
  readonly status: Ref<"ok" | "reset">;

  constructor(
    definition: SliceDefinition<string, TSchema>,
    raw: unknown,
    pushNotice: (notice: SettingsNotice) => void,
  ) {
    const parsed = v.safeParse(definition.schema, raw);
    if (parsed.success) {
      this.state = reactive(structuredClone(parsed.output) as object);
      this.status = ref<"ok" | "reset">("ok");
    } else {
      this.state = reactive(structuredClone(definition.defaults) as object);
      this.status = ref<"ok" | "reset">("reset");
      pushNotice({
        kind: "slice-reset",
        sliceKey: definition.key,
        detail: parsed.issues.map((issue) => issue.message).join("; "),
      });
    }
  }

  serialize(): unknown {
    return JSON.parse(JSON.stringify(this.state));
  }
}
