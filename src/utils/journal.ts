import type { JournalSettings } from "@/types/settings.types";

export function getWritingDescription(writing: JournalSettings["write"]): string {
  if (writing.type === "custom") {
    return `every ${writing.duration} ${writing.every}s`;
  }
  switch (writing.type) {
    case "day": {
      return "daily";
    }
    case "week": {
      return "weekly";
    }
    case "month": {
      return "monthly";
    }
    case "quarter": {
      return "quarterly";
    }
    case "year": {
      return "annually";
    }
  }
  return "";
}
