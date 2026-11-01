// Leaf on purpose: the visibility rule, which journalConfigSchema imports, matches tags through this too.

// Obsidian's tag search and TaskNotes' own: `#work` finds `#Work` and `#work/project`, never `#workshop`.
export function tagMatches(tag: string, wanted: string): boolean {
  const have = tag.toLowerCase();
  const want = wanted.toLowerCase();
  return have === want || have.startsWith(`${want}/`);
}

export function carriesAnyTag(present: readonly string[], wanted: readonly string[]): boolean {
  return wanted.some((want) => present.some((tag) => tagMatches(tag, want)));
}
