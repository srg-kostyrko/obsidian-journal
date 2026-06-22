import { LogLevelGate } from "./log-level-gate";

import type { Fields, LogLevel, LogRecord, LogSink } from "./types";

export class Logger {
  readonly #sinks: readonly LogSink[];
  readonly #gate: LogLevelGate;

  constructor(
    readonly name: string,
    sinks: readonly LogSink[],
    gate: LogLevelGate = new LogLevelGate("debug"),
  ) {
    this.#sinks = sinks;
    this.#gate = gate;
  }

  #emit(level: LogLevel, message: string, fields?: Fields): void {
    if (!this.#gate.isEnabled(level)) return;
    const record: LogRecord = {
      timestamp: Date.now(),
      level,
      name: this.name,
      message,
      fields,
    };
    for (const sink of this.#sinks) {
      try {
        sink.write(record);
      } catch {
        // A throwing sink must not break the caller and must not block sibling sinks.
      }
    }
  }

  debug(message: string, fields?: Fields): void {
    this.#emit("debug", message, fields);
  }

  info(message: string, fields?: Fields): void {
    this.#emit("info", message, fields);
  }

  warn(message: string, fields?: Fields): void {
    this.#emit("warn", message, fields);
  }

  error(message: string, fields?: Fields): void {
    this.#emit("error", message, fields);
  }

  child(name: string): Logger {
    const composed = this.name === "" ? name : `${this.name}.${name}`;
    return new Logger(composed, this.#sinks, this.#gate);
  }
}
