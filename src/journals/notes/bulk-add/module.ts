import type { Module } from "@/infrastructure/di";

import { BulkAddService } from "./bulk-add-service";

export const bulkAddModule: Module = {
  register(c) {
    c.register(BulkAddService).useClass(BulkAddService);
  },
};
