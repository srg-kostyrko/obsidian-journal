import { describe, expect, it } from "vitest";

import { FlowError } from "@/infrastructure/flows";

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
});

describe("JournalNameTakenError", () => {
  it("exposes the conflicting name", () => {
    const err = new JournalNameTakenError("daily");
    expect(err.kind).toBe("name-taken");
    expect(err.name).toBe("daily");
  });
});

describe("UnknownJournalError", () => {
  it("exposes the missing journal name", () => {
    const err = new UnknownJournalError("ghost");
    expect(err.kind).toBe("unknown-journal");
    expect(err.journalName).toBe("ghost");
  });
});

describe("UnknownSequenceSourceError", () => {
  it("exposes the journal name and source index", () => {
    const err = new UnknownSequenceSourceError("daily", 2);
    expect(err.kind).toBe("unknown-sequence-source");
    expect(err.journalName).toBe("daily");
    expect(err.sourceIndex).toBe(2);
  });
});

describe("toFlowError", () => {
  it("wraps a lifecycle error in JournalLifecycleFlowError", () => {
    const cause = new JournalNameTakenError("daily");
    const wrapped = toFlowError(cause);
    expect(wrapped).toBeInstanceOf(JournalLifecycleFlowError);
    expect(wrapped).toBeInstanceOf(FlowError);
    expect(wrapped.cause).toBe(cause);
  });
});
