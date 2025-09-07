import { Injectable } from "../di/decorators/Injectable";
import { LogLevel, type LoggerService as LoggerServiceContract, type LogRecord } from "./logger.types";

import { LoggerService as LoggerServiceToken, LoggerSettings } from "./logger.tokens";
import { inject } from "../di/inject";

export
@Injectable(LoggerServiceToken)
class LoggerService implements LoggerServiceContract {
  #settings = inject(LoggerSettings);

  #records: LogRecord[] = [];

  #levels = new Map<LogLevel, number>([
    [LogLevel.debug, 1],
    [LogLevel.info, 2],
    [LogLevel.warn, 3],
    [LogLevel.error, 4],
  ]);

  get #minLoglevel() {
    return this.#levels.get(this.#settings.logLevel) ?? 4;
  }

  log(logRecord: LogRecord): void {
    if (this.#getRecordLogLevel(logRecord) >= this.#minLoglevel) {
      this.#records.push(logRecord);
    }
    // TODO output only allowed levels
    this.#outputToConsole(logRecord);
  }

  records(): LogRecord[] {
    return this.#records;
  }

  clear(): void {
    this.#records = [];
  }

  #outputToConsole(logRecord: LogRecord): void {
    // eslint-disable-next-line no-console
    const method = console[logRecord.level] || console.log;
    method(
      "[Journals] %s | %s | %s",
      new Date(logRecord.timestamp).toISOString(),
      logRecord.scope,
      logRecord.message,
      logRecord.info,
    );
  }

  #getRecordLogLevel(logRecord: LogRecord): number {
    return this.#levels.get(logRecord.level) ?? 4;
  }
}
