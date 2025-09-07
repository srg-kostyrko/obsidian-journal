import { createToken } from "../di/token";
import type {
  LoggerService as LoggerServiceContract,
  Logger as LoggerContract,
  LoggerSettings as LoggerSettingsContract,
} from "./logger.types";

export const LoggerService = createToken<LoggerServiceContract>("LoggerService");

export const Logger = createToken<LoggerContract>("Logger");

export const LoggerSettings = createToken<LoggerSettingsContract>("LoggerSettings");
