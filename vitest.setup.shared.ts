import { cleanup } from "@testing-library/vue";
import { afterAll, afterEach } from "vitest";

import { resetCalendarLocale } from "@/calendar/testing";

// Files in the "shared" project run against one module registry per worker, so anything a file
// leaves behind in a process-global is still there when the next file starts. These hooks hand the
// next file the same blank slate a freshly isolated worker would.
afterEach(cleanup);
afterAll(resetCalendarLocale);
