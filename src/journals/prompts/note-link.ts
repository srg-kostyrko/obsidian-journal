// Obsidian reads these as a heading, a block, an alias or the link's own end, so a name holding
// one links somewhere other than the note it names.
const UNLINKABLE = /[#^|[\]]/;

export function hasUnlinkableCharacters(text: string): boolean {
  return UNLINKABLE.test(text);
}

/** The stored answer for what a note link field holds, or undefined when it holds nothing. */
export function toNoteLink(text: string): string | undefined {
  const trimmed = text.trim();
  return trimmed === "" ? undefined : `[[${trimmed}]]`;
}
