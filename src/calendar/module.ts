import type { Module } from "@/infrastructure/di";

import { Calendar } from "./calendar";

export const CalendarModule: Module = {
  register(c) {
    c.register(Calendar).useClass(Calendar).eager();
  },
};
