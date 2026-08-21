import { cleanup } from "@testing-library/vue";
import { afterEach, beforeEach } from "vitest";

import { installTestCalendar } from "@/calendar/testing";

// The beforeEach re-pins every test to the same calendar grid before it runs, which is what
// supersedes the old afterAll-only reset (once per worker, not once per test).
beforeEach(() => void installTestCalendar());
// Workers share one happy-dom document across the files they run, so a component left mounted
// answers the next test's queries.
afterEach(cleanup);
