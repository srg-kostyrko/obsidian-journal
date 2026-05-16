import { describe, expect, it } from "vitest";

import {
  InvalidJournalNameError,
  JournalLifecycleFlowError,
  JournalNameTakenError,
  UnknownJournalError,
  UnknownSequenceSourceError,
  toFlowError,
} from "./errors";

describe("InvalidJournalNameError", () => {
  it("has kind 'invalid-name'", () => {
    expect(new InvalidJournalNameError("bad").kind).toBe("invalid-name");
  });

  it("exposes the attempted name", () => {
    expect(new InvalidJournalNameError("bad").attemptedName).toBe("bad");
  });
});

describe("JournalNameTakenError", () => {
  it("has kind 'name-taken'", () => {
    expect(new JournalNameTakenError("daily").kind).toBe("name-taken");
  });

  it("exposes the conflicting name on the .name field", () => {
    expect(new JournalNameTakenError("daily").name).toBe("daily");
  });
});

describe("UnknownJournalError", () => {
  it("has kind 'unknown-journal'", () => {
    expect(new UnknownJournalError("ghost").kind).toBe("unknown-journal");
  });

  it("exposes the missing journal name", () => {
    expect(new UnknownJournalError("ghost").journalName).toBe("ghost");
  });
});

describe("UnknownSequenceSourceError", () => {
  it("has kind 'unknown-sequence-source'", () => {
    expect(new UnknownSequenceSourceError("daily", 2).kind).toBe("unknown-sequence-source");
  });

  it("exposes the journal name", () => {
    expect(new UnknownSequenceSourceError("daily", 2).journalName).toBe("daily");
  });

  it("exposes the source index", () => {
    expect(new UnknownSequenceSourceError("daily", 2).sourceIndex).toBe(2);
  });
});

describe("toFlowError", () => {
  it("wraps a lifecycle error in JournalLifecycleFlowError", () => {
    const cause = new JournalNameTakenError("daily");
    const wrapped = toFlowError(cause);
    expect(wrapped).toBeInstanceOf(JournalLifecycleFlowError);
  });

  it("preserves the original error as the .cause", () => {
    const cause = new JournalNameTakenError("daily");
    const wrapped = toFlowError(cause);
    expect(wrapped.cause).toBe(cause);
  });
});
