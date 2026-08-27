import { beforeEach, describe, expect, it } from "vitest";

import { Container } from "@/infrastructure/di";
import { NoticeService } from "@/infrastructure/host";
import { FakeNoticeService } from "@/infrastructure/host/testing";
import { LogLevelGate, LogLevelGateToken } from "@/infrastructure/logger/log-level-gate";
import { createLoggerTestingModule, type MemorySink } from "@/infrastructure/logger/testing";
import { AsyncResult } from "@/infrastructure/result";
import { expectErr, expectOk } from "@/infrastructure/result/testing";

import { FlowError, UserAborted, type BenignFlowError, type UserFacingFlowError } from "./errors";
import { Flows } from "./flows";

import type { Flow } from "./types";

class CompletingFlow implements Flow<{ value: string }, string, never> {
  execute(parameters: { value: string }): AsyncResult<string, never> {
    return AsyncResult.ok(`got:${parameters.value}`);
  }
}

class AbortingFlow implements Flow<null, never, UserAborted> {
  execute(): AsyncResult<never, UserAborted> {
    return AsyncResult.err(new UserAborted("test-source"));
  }
}

class DomainError extends FlowError {
  readonly kind = "domain-error" as const;
  constructor() {
    super("domain failed");
    this.name = "DomainError";
  }
}

class FailingFlow implements Flow<null, never, DomainError> {
  execute(): AsyncResult<never, DomainError> {
    return AsyncResult.err(new DomainError());
  }
}

class BenignError extends FlowError implements BenignFlowError {
  readonly kind = "benign-error" as const;
  readonly benign = true as const;
  constructor() {
    super("benign failure");
    this.name = "BenignError";
  }
}

class BenignFailingFlow implements Flow<null, never, BenignError> {
  execute(): AsyncResult<never, BenignError> {
    return AsyncResult.err(new BenignError());
  }
}

class UserFacingError extends FlowError implements UserFacingFlowError {
  readonly kind = "user-facing-error" as const;
  readonly userNotice = "Journal \u{201C}daily\u{201D} cannot create a note.";
  constructor() {
    super("user facing failure");
    this.name = "UserFacingError";
  }
}

class UserFacingFailingFlow implements Flow<null, never, UserFacingError> {
  execute(): AsyncResult<never, UserFacingError> {
    return AsyncResult.err(new UserFacingError());
  }
}

function buildContainer(): { c: Container; sink: MemorySink; notices: FakeNoticeService } {
  const { module, sink } = createLoggerTestingModule();
  const notices = new FakeNoticeService();
  const c = new Container();
  c.addModule(module);
  // This suite asserts the level Flows logs at, including "info", which the testing module's
  // production-matching "warn" default would filter before it reaches the sink.
  c.override(LogLevelGateToken).useValue(new LogLevelGate("debug"));
  c.register(NoticeService).useValue(notices);
  c.register(Flows).useClass(Flows);
  return { c, sink, notices };
}

function settledRecord(sink: MemorySink) {
  return sink.records.find((r) => r.level !== "debug");
}

describe("Flows", () => {
  describe("invoke", () => {
    let c: Container;
    let sink: MemorySink;
    let notices: FakeNoticeService;

    beforeEach(() => {
      const built = buildContainer();
      c = built.c;
      sink = built.sink;
      notices = built.notices;
    });

    it("returns the Ok produced by the flow", async () => {
      c.register(CompletingFlow).useClass(CompletingFlow);
      const result = await c.resolve(Flows).invoke(CompletingFlow, { value: "x" });
      expectOk(result);
      expect(result.value).toBe("got:x");
    });

    it("propagates the Err value through unchanged when the flow returns UserAborted", async () => {
      c.register(AbortingFlow).useClass(AbortingFlow);
      const result = await c.resolve(Flows).invoke(AbortingFlow, null);
      expectErr(result);
      expect(result.error).toBeInstanceOf(UserAborted);
    });

    it("propagates the Err value through unchanged when the flow returns another FlowError", async () => {
      c.register(FailingFlow).useClass(FailingFlow);
      const result = await c.resolve(Flows).invoke(FailingFlow, null);
      expectErr(result);
      expect(result.error).toBeInstanceOf(DomainError);
    });

    it("logs at info level on completion", async () => {
      c.register(CompletingFlow).useClass(CompletingFlow);
      await c.resolve(Flows).invoke(CompletingFlow, { value: "x" });
      expect(settledRecord(sink)?.level).toBe("info");
    });

    it("logs at info level on UserAborted", async () => {
      c.register(AbortingFlow).useClass(AbortingFlow);
      await c.resolve(Flows).invoke(AbortingFlow, null);
      expect(settledRecord(sink)?.level).toBe("info");
    });

    it("logs at error level on other FlowError subclasses", async () => {
      c.register(FailingFlow).useClass(FailingFlow);
      await c.resolve(Flows).invoke(FailingFlow, null);
      expect(settledRecord(sink)?.level).toBe("error");
    });

    it("logs at info level when the flow returns a FlowError marked benign", async () => {
      c.register(BenignFailingFlow).useClass(BenignFailingFlow);
      await c.resolve(Flows).invoke(BenignFailingFlow, null);
      expect(settledRecord(sink)?.level).toBe("info");
    });

    it("shows a notice when the flow fails", async () => {
      c.register(FailingFlow).useClass(FailingFlow);
      await c.resolve(Flows).invoke(FailingFlow, null);
      expect(notices.messages).toHaveLength(1);
    });

    it("names the underlying failure in the notice", async () => {
      c.register(FailingFlow).useClass(FailingFlow);
      await c.resolve(Flows).invoke(FailingFlow, null);
      expect(notices.messages.at(0)).toContain("domain failed");
    });

    it("shows the error's own notice when the flow fails with a user-facing error", async () => {
      c.register(UserFacingFailingFlow).useClass(UserFacingFailingFlow);
      await c.resolve(Flows).invoke(UserFacingFailingFlow, null);
      expect(notices.messages.at(0)).toBe("Journal \u{201C}daily\u{201D} cannot create a note.");
    });

    it("stays silent when the user aborted", async () => {
      c.register(AbortingFlow).useClass(AbortingFlow);
      await c.resolve(Flows).invoke(AbortingFlow, null);
      expect(notices.messages).toHaveLength(0);
    });

    it("stays silent when the failure is marked benign", async () => {
      c.register(BenignFailingFlow).useClass(BenignFailingFlow);
      await c.resolve(Flows).invoke(BenignFailingFlow, null);
      expect(notices.messages).toHaveLength(0);
    });

    it("stays silent on success", async () => {
      c.register(CompletingFlow).useClass(CompletingFlow);
      await c.resolve(Flows).invoke(CompletingFlow, { value: "x" });
      expect(notices.messages).toHaveLength(0);
    });

    it("stays silent when the caller opts out of notifying", async () => {
      c.register(FailingFlow).useClass(FailingFlow);
      await c.resolve(Flows).invoke(FailingFlow, null, { notify: false });
      expect(notices.messages).toHaveLength(0);
    });

    it("still logs the failure when the caller opts out of notifying", async () => {
      c.register(FailingFlow).useClass(FailingFlow);
      await c.resolve(Flows).invoke(FailingFlow, null, { notify: false });
      expect(settledRecord(sink)?.level).toBe("error");
    });

    it("merges caller-supplied context into the completion log fields", async () => {
      c.register(CompletingFlow).useClass(CompletingFlow);
      await c.resolve(Flows).invoke(CompletingFlow, { value: "x" }, { context: { command: "open-today" } });
      expect(settledRecord(sink)?.fields).toMatchObject({ command: "open-today" });
    });

    it("merges caller-supplied context into the failure log fields", async () => {
      c.register(FailingFlow).useClass(FailingFlow);
      await c.resolve(Flows).invoke(FailingFlow, null, { context: { command: "open-today" } });
      expect(settledRecord(sink)?.fields).toMatchObject({ command: "open-today" });
    });
  });
});
