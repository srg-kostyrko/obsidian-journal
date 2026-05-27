import { defineCodeBlock } from "@/infrastructure/host";

import { homeBlockSchema } from "./home-config";
import HomeCodeBlock from "./ui/HomeCodeBlock.vue";

export const homeCodeBlock = defineCodeBlock({
  keys: ["journals-home"],
  schema: homeBlockSchema,
  component: HomeCodeBlock,
  cssClass: ["journal-home-code-block"],
});
