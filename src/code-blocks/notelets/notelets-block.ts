import { defineCodeBlock } from "@/infrastructure/host";

import { noteletsBlockKeys, noteletsBlockSchema } from "./notelets-config";
import NoteletsCodeBlock from "./ui/NoteletsCodeBlock.vue";

export const noteletsCodeBlock = defineCodeBlock({
  keys: ["journal-notelets"],
  schema: noteletsBlockSchema,
  component: NoteletsCodeBlock,
  cssClass: ["journal-notelets-code-block"],
  knownKeys: noteletsBlockKeys,
});
