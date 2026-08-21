import { cleanup } from "@testing-library/vue";
import { afterEach, beforeEach } from "vitest";

import { installTestCalendar } from "@/calendar/testing";

// The beforeEach re-pins every test to the same calendar grid before it runs, which is what
// supersedes the old afterAll-only reset (once per worker, not once per test).
beforeEach(() => void installTestCalendar());
afterEach(cleanup);
