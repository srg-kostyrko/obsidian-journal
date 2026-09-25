import type { NoteStructure, StructureListItem } from "@/infrastructure/host";

// Shared by identification (checkbox provider) and filtering (listing queries) — both re-derive
// a heading chain or a tag set from the same NoteStructure shape, and a TaskItem carries neither
// itself.
export function headingsOf(line: number, structure: NoteStructure): readonly string[] {
  const chain: string[] = [];
  let level = Infinity;
  for (const heading of structure.headings.toReversed()) {
    if (heading.line >= line) continue;
    if (heading.level >= level) continue;
    chain.push(heading.heading);
    level = heading.level;
  }
  return chain;
}

export function tagsOf(item: Pick<StructureListItem, "line" | "endLine">, structure: NoteStructure): readonly string[] {
  const inline = structure.tags
    .filter((tag) => tag.line >= item.line && tag.line <= item.endLine)
    .map((tag) => tag.tag);
  return [...inline, ...structure.frontmatterTags];
}
