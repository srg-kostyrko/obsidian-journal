import type { LogRecord } from "@/infrastructure/logger";

function line(record: LogRecord): string {
  const time = new Date(record.timestamp).toISOString();
  const name = record.name === "" ? "journals" : `journals:${record.name}`;
  const fields = record.fields === undefined ? "" : ` ${JSON.stringify(record.fields)}`;
  return `${time} [${record.level}] [${name}] ${record.message}${fields}`;
}

export function formatLogDump(records: readonly LogRecord[]): string {
  return ["```", ...records.map(line), "```", ""].join("\n");
}
