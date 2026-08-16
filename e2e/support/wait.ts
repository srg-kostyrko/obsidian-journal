import { browser } from "@wdio/globals";

// One polling primitive behind every waitFor* helper: poll an async reader until
// it yields a defined value the predicate accepts. No fixed sleeps — real state
// (metadataCache catch-up, debounced saveData, the live editor) converges on its
// own clock, observable only by re-reading.
export async function waitForState<T>(
  read: () => Promise<T | undefined | null>,
  predicate: (value: T) => boolean,
  timeoutMsg: string,
): Promise<void> {
  await browser.waitUntil(
    async () => {
      const value = await read();
      // Null as well as undefined: a reader built on `executeObsidian` returns its value over
      // the WebDriver wire, which serializes `undefined` to `null`. Testing only for `undefined`
      // let the not-ready-yet read reach the predicate, so "no frontmatter parsed yet" threw
      // out of waitUntil instead of polling again — the retry this primitive exists to provide.
      return value !== undefined && value !== null && predicate(value);
    },
    { timeoutMsg },
  );
}
