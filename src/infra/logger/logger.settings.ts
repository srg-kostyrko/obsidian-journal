import { Injectable } from "../di/decorators/Injectable";
import type { LoggerSettings as LoggerSettingsContract, LogLevel } from "./logger.types";

import { LoggerSettings as LoggerSettingsToken } from "./logger.tokens";

export
@Injectable(LoggerSettingsToken)
class LoggerSettings implements LoggerSettingsContract {
  logLevel = "error" as LogLevel;
}
