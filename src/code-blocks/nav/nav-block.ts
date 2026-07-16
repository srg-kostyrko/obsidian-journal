import { defineCodeBlock } from "@/infrastructure/host";

import { navBlockSchema } from "./nav-config";
import NavigationCodeBlock from "./ui/NavigationCodeBlock.vue";

export const navigationCodeBlock = defineCodeBlock({
  keys: ["journal-nav", "calendar-nav", "interval-nav"],
  schema: navBlockSchema,
  component: NavigationCodeBlock,
  cssClass: ["journal-nav-code-block"],
});
