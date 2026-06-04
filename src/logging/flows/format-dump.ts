import type { Fields, LogRecord } from "@/infrastructure/logger";

function serializeFields(fields: Fields): string {
  try {
    return JSON.stringify(fields);
  } catch {
    // Log fields are arbitrary values; circular refs or BigInt would otherwise crash the whole dump.
    return "[unserializable fields]";
  }
}

function line(record: LogRecord): string {
  const time = new Date(record.timestamp).toISOString();
  const name = record.name === "" ? "journals" : `journals:${record.name}`;
  const fields = record.fields === undefined ? "" : ` ${serializeFields(record.fields)}`;
  return `${time} [${record.level}] [${name}] ${record.message}${fields}`;
}

export function formatLogDump(records: readonly LogRecord[]): string {
  return ["```", ...records.map(line), "```", ""].join("\n");
}
