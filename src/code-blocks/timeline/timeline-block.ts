import { defineCodeBlock } from "@/infrastructure/host";

import { timelineBlockKeys, timelineBlockSchema } from "./timeline-config";
import TimelineCodeBlock from "./ui/TimelineCodeBlock.vue";

export const timelineCodeBlock = defineCodeBlock({
  keys: ["calendar-timeline"],
  schema: timelineBlockSchema,
  knownKeys: timelineBlockKeys,
  component: TimelineCodeBlock,
  cssClass: ["journal-timeline-code-block"],
});
