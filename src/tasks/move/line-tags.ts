/** Whether a line's text carries `tag` as a whole inline tag, case-insensitively. */
export function lineHasTag(line: string, tag: string): boolean {
  if (tag === "") return false;
  const escaped = tag.replaceAll(/[.*+?^${}()|[\]\\]/gu, String.raw`\$&`);
  return new RegExp(String.raw`(?:^|\s)${escaped}(?=[\s,.;:!?)]|$)`, "iu").test(line);
}
