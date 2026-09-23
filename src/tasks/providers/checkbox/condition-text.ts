// metadataCache spells the two sides differently: inline tags and parseFrontMatterTags both carry
// the leading "#", while a heading's `heading` is its text with the markdown "#" already stripped.
// `identifies` compares by exact equality, so a value typed in the other spelling matches nothing
// and the rule silently identifies no tasks at all. Coerced here rather than validated: there is
// no spelling a user can reach for that cannot be resolved to the one metadataCache uses, so a
// rejection would only ever be a worse way of saying the same thing.
export function conditionValues(text: string, type: "tag" | "heading"): string[] {
  return text
    .split(",")
    .map((entry) =>
      entry
        .trim()
        .replace(/^#+\s*/, "")
        .trim(),
    )
    .filter((entry) => entry.length > 0)
    .map((entry) => (type === "tag" ? `#${entry}` : entry));
}
