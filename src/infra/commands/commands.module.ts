import type { Module } from "../di/contracts/module.types";
import { CommandsRunner } from "./commands-runner";

export const CommandsModule: Module = {
  provides: [CommandsRunner],
};
