import * as v from "valibot";

import { asRecord } from "../fence-record";

// The nav fence carries no options — rows come from the journal config — so any body
// degrades to an empty record. Fronting the object schema with asRecord keeps a scalar or
// sequence body from failing validation into an error panel.
export const navBlockSchema = v.pipe(v.unknown(), v.transform(asRecord), v.object({}));
