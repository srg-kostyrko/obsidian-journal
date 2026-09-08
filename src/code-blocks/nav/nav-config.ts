import * as v from "valibot";

import { asRecord } from "../fence-record";

function asAdjacent(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined;
}

const navBlockEntries = {
  // Unset follows the journal's own "show previous and next periods" setting. A boolean is
  // required rather than an on/off word: js-yaml 4 reads only true/false as booleans, so `on`
  // would arrive as the string "on" and degrade to unset — the same contract the timeline's
  // `navigation` option keeps.
  adjacent: v.pipe(v.optional(v.unknown()), v.transform(asAdjacent)),
};

// Fronting the object schema with asRecord keeps a scalar or sequence body from failing
// validation into an error panel; every option inside degrades rather than erroring.
export const navBlockSchema = v.pipe(v.unknown(), v.transform(asRecord), v.object(navBlockEntries));

// Derived from the entries so the two can never drift: the block reports any other key as
// unrecognized rather than ignoring it and rendering a plausible-looking default.
export const navBlockKeys = Object.keys(navBlockEntries);

export type NavBlockFenceConfig = v.InferOutput<typeof navBlockSchema>;
