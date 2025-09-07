import type { Module } from "../di/contracts/module.types";
import { Logger } from "./logger";
import { LoggerService } from "./logger.service";
import { LoggerSettings } from "./logger.settings";

export const LoggerModule: Module = {
  provides: [LoggerSettings, LoggerService, Logger],
};
