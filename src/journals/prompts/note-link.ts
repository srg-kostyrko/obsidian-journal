/** The stored answer for what a note link field holds, or undefined when it holds nothing. */
export function toNoteLink(text: string): string | undefined {
  const trimmed = text.trim();
  return trimmed === "" ? undefined : `[[${trimmed}]]`;
}
