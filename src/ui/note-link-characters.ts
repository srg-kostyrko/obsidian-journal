// Obsidian reads these as a heading, a block, an alias or the link's own end, so a name holding
// one links somewhere other than the note it names.
const UNLINKABLE = /[#^|[\]]/;

export function hasUnlinkableCharacters(text: string): boolean {
  return UNLINKABLE.test(text);
}
