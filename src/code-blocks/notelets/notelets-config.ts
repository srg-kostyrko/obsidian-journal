import * as v from "valibot";

import { asFenceStringList, asRecord } from "../fence-record";

const noteletsEntries = {
  types: v.optional(v.pipe(v.unknown(), v.transform(asFenceStringList)), () => [] as string[]),
};

export const noteletsBlockSchema = v.pipe(v.unknown(), v.transform(asRecord), v.object(noteletsEntries));

// Derived from the entries so the two can never drift: the block reports any other key as
// unrecognized rather than ignoring it and rendering a plausible-looking default.
export const noteletsBlockKeys = Object.keys(noteletsEntries);

export type NoteletsFenceConfig = v.InferOutput<typeof noteletsBlockSchema>;
