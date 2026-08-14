import { browser } from "@wdio/globals";

// One polling primitive behind every waitFor* helper: poll an async reader until
// it yields a defined value the predicate accepts. No fixed sleeps — real state
// (metadataCache catch-up, debounced saveData, the live editor) converges on its
// own clock, observable only by re-reading.
export async function waitForState<T>(
  read: () => Promise<T | undefined>,
  predicate: (value: T) => boolean,
  timeoutMsg: string,
): Promise<void> {
  await browser.waitUntil(
    async () => {
      const value = await read();
      return value !== undefined && predicate(value);
    },
    { timeoutMsg },
  );
}
