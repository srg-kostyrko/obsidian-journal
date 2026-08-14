export interface MarkdownLinkInput {
  /** Vault-relative path of the target without its extension, e.g. `Journals/2026/2026-01-01`. */
  readonly pathWithoutExtension: string;
  /** Target basename, e.g. `2026-01-01`. */
  readonly basename: string;
  /** Obsidian's "Use [[Wikilinks]]" toggle; false produces a `[label](path.md)` markdown link. */
  readonly useMarkdownLinks: boolean;
}

// Only reached for a target that does not exist yet, so the vault's "New link format" preference is
// deliberately ignored: a shortest-form link carries no folder, and following it would create the
// note in the vault's default location instead of the journal's folder, leaving it unconnected.
// The alias keeps the short display that preference asks for.
export function buildMarkdownLink(input: MarkdownLinkInput): string {
  if (input.useMarkdownLinks) {
    const target = `${input.pathWithoutExtension}.md`;
    return `[${input.basename}](${target.includes(" ") ? `<${target}>` : target})`;
  }
  if (input.pathWithoutExtension === input.basename) return `[[${input.basename}]]`;
  return `[[${input.pathWithoutExtension}|${input.basename}]]`;
}
