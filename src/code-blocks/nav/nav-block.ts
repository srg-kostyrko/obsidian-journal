import * as v from "valibot";

import { defineCodeBlock } from "@/infrastructure/host";

import NavigationCodeBlock from "./ui/NavigationCodeBlock.vue";

export const navigationCodeBlock = defineCodeBlock({
  keys: ["journal-nav", "calendar-nav", "interval-nav"],
  schema: v.object({}),
  component: NavigationCodeBlock,
  cssClass: ["journal-nav-code-block"],
});
