import { describe, expect, it } from "vitest";

import { AsyncResult } from "@/infrastructure/result";
import { expectOk } from "@/infrastructure/result/testing";

import { MoveLocks } from "./locks";

function gated(log: string[], name: string) {
  const { promise, resolve } = Promise.withResolvers<void>();
  const run = (): AsyncResult<string, never> =>
    AsyncResult.fromPromise(
      (async () => {
        log.push(`${name} start`);
        await promise;
        log.push(`${name} end`);
        return name;
      })(),
      () => {
        throw new Error("unreachable");
      },
    );
  return { run, release: resolve };
}

async function tick(): Promise<void> {
  await new Promise((resolve) => window.setTimeout(resolve, 0));
}

describe("MoveLocks", () => {
  it("a run holding several journals waits for each of them, and only those", async () => {
    const locks = new MoveLocks();
    const log: string[] = [];
    const roll = gated(log, "roll B");
    const move = gated(log, "move B to C");
    const other = gated(log, "roll D");

    const first = locks.run(["B"], roll.run);
    const second = locks.run(["C", "B"], move.run);
    const third = locks.run(["D"], other.run);
    await tick();
    expect(log).toEqual(["roll B start", "roll D start"]);
    roll.release();
    await tick();
    expect(log).toEqual(["roll B start", "roll D start", "roll B end", "move B to C start"]);
    move.release();
    other.release();

    expectOk(await first);
    expectOk(await second);
    expectOk(await third);
  });

  it("moves in opposite directions between two journals run one after the other, never deadlocked", async () => {
    const locks = new MoveLocks();
    const log: string[] = [];
    const there = gated(log, "A to B");
    const back = gated(log, "B to A");

    const first = locks.run(["A", "B"], there.run);
    const second = locks.run(["B", "A", "B"], back.run);
    await tick();
    expect(log).toEqual(["A to B start"]);
    there.release();
    back.release();

    expectOk(await first);
    expectOk(await second);
    expect(log).toEqual(["A to B start", "A to B end", "B to A start", "B to A end"]);
  });
});
