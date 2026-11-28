import type { Migration } from "@/settings";

// Changes nothing. A date condition may now store a moving day ("last", { nth, weekday }), which
// a version-8 plugin rejects and drops; the bump makes that plugin refuse to save over the file
// instead of writing it back without the decoration.
export const v8ToV9Migration: Migration = {
  fromVersion: 8,
  toVersion: 9,
  migrate(raw) {
    return raw;
  },
};
