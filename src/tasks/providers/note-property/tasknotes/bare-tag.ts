// The one reading of a TaskNotes tag, so the check that a tag identifies something and the copy of
// it can never disagree: trim first, strip a leading "#", trim again.
export function bareTag(tag: string): string {
  return tag.trim().replace(/^#/, "").trim();
}
