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
        // Whitespace after the "#" run is optional here, unlike the fence's own normalizeHeading
        // (src/code-blocks/tasks/tasks-config.ts), which requires it. Two spellings of the same
        // coercion now disagree inside one feature, and this is the side with the bug: a heading
        // whose text legitimately begins with "#" and no space — "#1 priority" — is mangled to
        // "1 priority" here while the fence leaves it alone. Not tightened in place because the
        // tag arm below depends on the loose form to collapse a doubled "##task" to "#task"; the
        // fix is to split the two arms, which changes values already stored in settings.
        .replace(/^#+\s*/, "")
        .trim(),
    )
    .filter((entry) => entry.length > 0)
    .map((entry) => (type === "tag" ? `#${entry}` : entry));
}
