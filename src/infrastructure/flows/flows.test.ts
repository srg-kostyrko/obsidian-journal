import { beforeEach, describe, expect, it } from "vitest";

import { Container } from "@/infrastructure/di";
import { createLoggerTestingModule, type MemorySink } from "@/infrastructure/logger/testing";
import { AsyncResult } from "@/infrastructure/result";
import { expectErr, expectOk } from "@/infrastructure/result/testing";

import { FlowError, UserAborted, type BenignFlowError } from "./errors";
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

function buildContainer(): { c: Container; sink: MemorySink } {
  const { module, sink } = createLoggerTestingModule();
  const c = new Container();
  c.addModule(module);
  c.register(Flows).useClass(Flows);
  return { c, sink };
}

function settledRecord(sink: MemorySink) {
  return sink.records.find((r) => r.level !== "debug");
}

describe("Flows", () => {
  describe("invoke", () => {
    let c: Container;
    let sink: MemorySink;

    beforeEach(() => {
      const built = buildContainer();
      c = built.c;
      sink = built.sink;
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
