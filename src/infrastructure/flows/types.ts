import type { AsyncResult } from "@/infrastructure/result";

import type { FlowError } from "./errors";

export interface Flow<P, R, E = FlowError> {
  execute(parameters: P): AsyncResult<R, E>;
}
