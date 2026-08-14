import { match } from "ts-pattern";

import type { LogRecord, LogSink } from "./types";

export class ConsoleSink implements LogSink {
  write(record: LogRecord): void {
    const tag = record.name === "" ? "[journals]" : `[journals:${record.name}]`;
    const consoleArguments = record.fields === undefined ? [tag, record.message] : [tag, record.message, record.fields];

    match(record.level)
      .with("debug", () => {
        console.debug(...consoleArguments);
      })
      .with("info", () => {
        console.info(...consoleArguments);
      })
      .with("warn", () => {
        console.warn(...consoleArguments);
      })
      .with("error", () => {
        console.error(...consoleArguments);
      })
      .exhaustive();
  }
}
