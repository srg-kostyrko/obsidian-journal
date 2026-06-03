export type NewLinkFormat = "shortest" | "relative" | "absolute";

export interface MarkdownLinkInput {
  /** Vault-relative path of the target without its extension, e.g. `Journals/2026/2026-01-01`. */
  readonly pathWithoutExtension: string;
  /** Target basename, e.g. `2026-01-01`. */
  readonly basename: string;
  /** Obsidian's "Use [[Wikilinks]]" toggle; false produces a `[label](path.md)` markdown link. */
  readonly useMarkdownLinks: boolean;
  /** Obsidian's "New link format" setting. */
  readonly format: NewLinkFormat;
  /** True when the basename does not unambiguously resolve to this target — another note claims it. */
  readonly ambiguous: boolean;
}

// "relative" falls back to the full vault-relative path: it always resolves, even though it isn't
// the literal relative form Obsidian would emit for an existing file.
export function buildMarkdownLink(input: MarkdownLinkInput): string {
  const linkpath = input.format === "shortest" && !input.ambiguous ? input.basename : input.pathWithoutExtension;
  if (!input.useMarkdownLinks) {
    return `[[${linkpath}]]`;
  }
  const target = `${linkpath}.md`;
  return `[${input.basename}](${target.includes(" ") ? `<${target}>` : target})`;
}
