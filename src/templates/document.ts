import { Err, Ok, type Result } from "@/infrastructure/result";

import { tokenize } from "./grammar";
import { continueMultiline, lineEndingOf, type LineEnding } from "./multiline";
import { renderFrontmatter } from "./yaml-value";

import type { FallibleRenderToken, RenderToken, Token } from "./types";

export interface FrontmatterSplit {
  readonly open: string;
  readonly body: string;
  readonly close: string;
  readonly rest: string;
}

const OPEN_RE = /^---\r?\n/;
const CLOSE_RE = /^---(?:\r?\n|$)/m;

// Found in the template as written, before anything renders, so a value that contains a `---`
// line cannot move where the frontmatter ends.
export function splitFrontmatter(template: string): FrontmatterSplit | undefined {
  const open = OPEN_RE.exec(template)?.[0];
  if (open === undefined) return undefined;
  const after = template.slice(open.length);
  const close = CLOSE_RE.exec(after);
  if (close === null) return undefined;
  return {
    open,
    body: after.slice(0, close.index),
    close: close[0],
    rest: after.slice(close.index + close[0].length),
  };
}

export function renderBody(text: string, render: RenderToken, eol: LineEnding): string {
  let out = "";
  for (const token of tokenize(text)) {
    if (token.kind === "literal") {
      out += token.text;
      continue;
    }
    const value = render(token);
    out += /[\r\n]/.test(value) ? continueMultiline(value, out.slice(out.lastIndexOf("\n") + 1), eol) : value;
  }
  return out;
}

// The layout code is string-in, string-out; the first failure is held aside and the rest of the
// tokens render as nothing, so no later token's work is done once the document cannot be produced.
export function renderDocumentWith<E>(template: string, render: FallibleRenderToken<E>): Result<string, E> {
  let failure: { error: E } | undefined;
  const guarded = (token: Token): string => {
    if (failure) return "";
    const rendered = render(token);
    if (rendered.kind === "err") {
      failure = { error: rendered.error };
      return "";
    }
    return rendered.value;
  };
  const eol = lineEndingOf(template);
  const split = splitFrontmatter(template);
  const out =
    split === undefined
      ? renderBody(template, guarded, eol)
      : split.open + renderFrontmatter(split.body, guarded, eol) + split.close + renderBody(split.rest, guarded, eol);
  return failure ? new Err(failure.error) : new Ok(out);
}
