import type { Module } from "@/infrastructure/di";

import { BulkAddService } from "./bulk-add-service";
import { BulkAddFlow } from "./flows/bulk-add.flow";

export const bulkAddModule: Module = {
  register(c) {
    c.register(BulkAddService).useClass(BulkAddService);
    c.register(BulkAddFlow).useClass(BulkAddFlow);
  },
};
