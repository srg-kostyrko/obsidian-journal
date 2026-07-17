import { defineCodeBlock } from "@/infrastructure/host";

import { homeBlockKeys, homeBlockSchema } from "./home-config";
import HomeCodeBlock from "./ui/HomeCodeBlock.vue";

export const homeCodeBlock = defineCodeBlock({
  keys: ["journals-home"],
  schema: homeBlockSchema,
  knownKeys: homeBlockKeys,
  component: HomeCodeBlock,
  cssClass: ["journal-home-code-block"],
});
