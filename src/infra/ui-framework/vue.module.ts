import type { Module } from "../di/contracts/module.types";
import { VueApp } from "./vue-app";

export const VueModule: Module = {
  provides: [VueApp],
};
