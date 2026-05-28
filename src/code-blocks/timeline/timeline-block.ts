import { defineCodeBlock } from "@/infrastructure/host";

import { timelineBlockSchema } from "./timeline-config";
import TimelineCodeBlock from "./ui/TimelineCodeBlock.vue";

export const timelineCodeBlock = defineCodeBlock({
  keys: ["calendar-timeline"],
  schema: timelineBlockSchema,
  component: TimelineCodeBlock,
  cssClass: ["journal-timeline-code-block"],
});
