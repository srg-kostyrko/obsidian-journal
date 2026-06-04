import { createToken } from "@/infrastructure/di";

import type { LogRecord, LogSink } from "./types";

export class BufferSink implements LogSink {
  static readonly capacity = 1000;

  readonly #records: LogRecord[] = [];

  write(record: LogRecord): void {
    this.#records.push(record);
    if (this.#records.length > BufferSink.capacity) this.#records.shift();
  }

  snapshot(): readonly LogRecord[] {
    return [...this.#records];
  }

  clear(): void {
    this.#records.length = 0;
  }
}

export const BufferSinkToken = createToken<BufferSink>("BufferSink");
