import type { JournalConfig } from "@/journals";

function prependFolder(existing: string, prefix: string): string {
  if (!prefix) return existing;
  if (!existing) return prefix;
  return `${existing}/${prefix}`;
}

export function extractFromNameTemplate(config: JournalConfig): void {
  if (!config.nameTemplate.includes("/")) return;
  const parts = config.nameTemplate.split("/");
  const last = parts.pop() ?? "";
  const prefix = parts.join("/");
  config.folder = prependFolder(config.folder, prefix);
  config.nameTemplate = last;
}

export function extractFromDateFormat(config: JournalConfig): void {
  if (!config.dateFormat.includes("/")) return;
  const parts = config.dateFormat.split("/");
  const last = parts.pop() ?? "";
  const prefix = parts.map((format) => `{{date:${format}}}`).join("/");
  config.folder = prependFolder(config.folder, prefix);
  config.dateFormat = last;
}
