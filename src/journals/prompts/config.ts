import * as v from "valibot";

const DEFAULT_DATE_FORMAT = "YYYY-MM-DD";

const promptOptionSchema = v.object({
  label: v.pipe(v.string(), v.minLength(1)),
  value: v.pipe(v.string(), v.minLength(1)),
});

const promptBase = v.object({
  variable: v.pipe(v.string(), v.minLength(1)),
  question: v.pipe(v.string(), v.minLength(1)),
  // Clearable: "" means the answer is never stored, so it renders into the body once and is
  // then gone. A prompt reaching the note name or folder must carry a real key — enforced in
  // settings, because fill state is a frontmatter question and never a filename parse.
  frontmatterKey: v.optional(v.string(), ""),
});

// Only the types with a blank state carry it: a yes/no answer is always one of its two values,
// so there is nothing for "required" to refuse there.
const requiredFlag = { required: v.optional(v.boolean(), false) };

export const promptSchema = v.variant("type", [
  v.object({
    ...promptBase.entries,
    ...requiredFlag,
    type: v.literal("text"),
    // No default on purpose: absent means one line, so nothing is written for the common case
    // and a version that predates the flag reads the question as ordinary text.
    multiline: v.optional(v.boolean()),
  }),
  v.object({ ...promptBase.entries, ...requiredFlag, type: v.literal("number") }),
  v.object({
    ...promptBase.entries,
    ...requiredFlag,
    type: v.literal("date"),
    // Clearable, so no minLength: a validation issue under `prompts` makes
    // repairCollectionEntry substitute the whole array with `[]`, wiping every question.
    // The schema default only covers an absent key; a present-but-empty value must fall
    // back on read (dateFormatFor), because moment().format("") is not "YYYY-MM-DD" and
    // formatToRegexp("") does not invert a note name.
    format: v.optional(v.string(), DEFAULT_DATE_FORMAT),
  }),
  v.object({ ...promptBase.entries, type: v.literal("toggle") }),
  v.object({
    ...promptBase.entries,
    ...requiredFlag,
    type: v.literal("select"),
    options: v.pipe(v.array(promptOptionSchema), v.minLength(1)),
  }),
]);

export const promptsSchema = v.pipe(
  v.array(promptSchema),
  v.check(
    (value) => new Set(value.map((p) => p.variable)).size === value.length,
    "prompt `variable` values must be unique",
  ),
  v.check((value) => {
    const keys = value.map((p) => p.frontmatterKey).filter((key) => key !== "");
    return new Set(keys).size === keys.length;
  }, "prompt `frontmatterKey` values must be unique"),
);

/**
 * Whether an answer has to be given before the note can be created.
 *
 * The type check is not redundant with the schema: a `required` left on a yes/no question by a
 * hand-edited config would otherwise read as a standing refusal of unattended creation, and the
 * editor offers no control to clear it.
 */
export function isRequired(prompt: Prompt): boolean {
  return prompt.type !== "toggle" && prompt.required;
}

export type PromptKind = Pick<Prompt, "type"> & { readonly multiline?: boolean | undefined };

export function isLongText(prompt: PromptKind): boolean {
  return prompt.type === "text" && prompt.multiline === true;
}

/**
 * Whether an answer may be part of a note name or folder.
 *
 * A yes/no answer renders a localized word no path pattern matches, and a long answer would put
 * line breaks into a file name.
 */
export function fitsInPath(prompt: PromptKind): boolean {
  return prompt.type !== "toggle" && !isLongText(prompt);
}

export type PromptDisplayType = PromptType | "longtext";

export function displayTypeOf(prompt: PromptKind): PromptDisplayType {
  return isLongText(prompt) ? "longtext" : prompt.type;
}

export function dateFormatFor(prompt: Extract<Prompt, { type: "date" }>): string {
  return prompt.format.trim() === "" ? DEFAULT_DATE_FORMAT : prompt.format;
}

export type PromptOption = v.InferOutput<typeof promptOptionSchema>;
export type Prompt = v.InferOutput<typeof promptSchema>;
export type PromptType = Prompt["type"];
export type PromptAnswer = string | number | boolean;
