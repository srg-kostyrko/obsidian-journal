import type { Module } from "@/infra/di/contracts/module.types";
import { TemplaterAdapter } from "./templater/templater-adapter";

export const PluginsModule: Module = {
  provides: [TemplaterAdapter],
};
