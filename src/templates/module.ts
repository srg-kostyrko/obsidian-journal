import type { Module } from "@/infrastructure/di";

import { TemplateEngine } from "./engine";

export const templatesModule: Module = {
  register(c) {
    c.register(TemplateEngine).useClass(TemplateEngine);
  },
};
