import { afterEach, beforeEach } from "vitest";

import { installTestCalendar, restoreEras } from "@/calendar/testing";

// The beforeEach re-pins every test to the same calendar grid before it runs, which is what
// supersedes the old afterAll-only reset (once per worker, not once per test).
beforeEach(() => void installTestCalendar());

// A test that times out mid-`withoutEras` never reaches its restore, and with `isolate: false` the
// next file in the worker would inherit a locale that throws on every `y` token.
afterEach(restoreEras);
