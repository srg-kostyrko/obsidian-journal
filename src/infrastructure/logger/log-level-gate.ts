import { createToken } from "@/infrastructure/di";

import type { LogLevel } from "./types";

const RANK: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 };

export class LogLevelGate {
  #threshold: LogLevel;

  constructor(threshold: LogLevel = "warn") {
    this.#threshold = threshold;
  }

  setThreshold(level: LogLevel): void {
    this.#threshold = level;
  }

  isEnabled(level: LogLevel): boolean {
    return RANK[level] >= RANK[this.#threshold];
  }
}

export const LogLevelGateToken = createToken<LogLevelGate>("LogLevelGate");
