import * as v from "valibot";

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
  required: v.optional(v.boolean(), false),
});

export const promptSchema = v.variant("type", [
  v.object({ ...promptBase.entries, type: v.literal("text") }),
  v.object({ ...promptBase.entries, type: v.literal("number") }),
  v.object({ ...promptBase.entries, type: v.literal("date") }),
  v.object({ ...promptBase.entries, type: v.literal("toggle") }),
  v.object({
    ...promptBase.entries,
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

export type PromptOption = v.InferOutput<typeof promptOptionSchema>;
export type Prompt = v.InferOutput<typeof promptSchema>;
export type PromptType = Prompt["type"];
export type PromptAnswer = string | number | boolean;
