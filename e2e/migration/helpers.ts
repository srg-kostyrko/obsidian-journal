import { waitForFrontmatter } from "../support/vault.js";

// Polls until the legacy note converges on the new schema: the new journal name
// and date field present, and the legacy section/start-date markers gone — a
// single convergence, so one observed end state proves the rewrite ran fully.
export function waitForMigratedNote(path: string, expected: { journal: string; date: string }): Promise<void> {
  return waitForFrontmatter(
    path,
    (frontmatter) =>
      frontmatter.journal === expected.journal &&
      frontmatter["journal-date"] === expected.date &&
      frontmatter["journal-section"] === undefined &&
      frontmatter["journal-start-date"] === undefined,
    `waited for ${path} to migrate to journal=${expected.journal} journal-date=${expected.date} (legacy markers cleared)`,
  );
}

// An interval note carries the legacy interval index, which the migration moves
// into the journal's configured index field (here the default `journal-index`)
// and drops the old key — a rewrite path the calendar notes never exercise.
export function waitForMigratedIntervalNote(
  path: string,
  expected: { journal: string; date: string; index: number },
): Promise<void> {
  return waitForFrontmatter(
    path,
    (frontmatter) =>
      frontmatter.journal === expected.journal &&
      frontmatter["journal-date"] === expected.date &&
      frontmatter["journal-index"] === expected.index &&
      frontmatter["journal-interval-index"] === undefined &&
      frontmatter["journal-start-date"] === undefined,
    `waited for ${path} to migrate to journal=${expected.journal} journal-index=${expected.index} (interval index moved, legacy markers cleared)`,
  );
}
