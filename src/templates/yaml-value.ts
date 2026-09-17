import { parseYaml } from "obsidian";

import { tokenize } from "./grammar";
import { continueMultiline, normalizeMultiline, type LineEnding } from "./multiline";

import type { RenderToken, Token } from "./types";

const ENTRY_RE = /^([ \t]*)((?:- +)*)([^\s#'"{[\]:][^:]*?:(?: +|$))?(.*?)([ \t]*)$/;
const BLOCK_INDICATOR_RE = /^[|>][+-]?\d?[+-]?$/;
const INDENT_RE = /^[ \t]*/;
const NULL_WORDS = new Set(["null", "Null", "NULL", "~"]);

interface Line {
  readonly content: string;
  readonly ending: string;
}

function linesOf(text: string): Line[] {
  return (text.match(/[^\n]*\n|[^\n]+$/g) ?? []).map((line) => {
    const content = line.replace(/\r?\n$/, "");
    return { content, ending: line.slice(content.length) };
  });
}

function renderTokens(tokens: readonly Token[], render: RenderToken): string {
  return tokens.map((token) => (token.kind === "literal" ? token.text : render(token))).join("");
}

// Kept as written whenever it reads back as itself or as a typed value a template may rely on —
// a number, a boolean, a list. Only what YAML would refuse, silently change, or silently drop
// (a bare `#` turning a real value into a comment, and the whole entry into null) is quoted.
function plainOrQuoted(value: string): string {
  if (value === "") return value;
  try {
    const read = (parseYaml(`value: ${value}`) as Record<string, unknown> | null)?.value;
    if (typeof read === "string") return read === value ? value : JSON.stringify(value);
    if ((read === null || read === undefined) && !NULL_WORDS.has(value)) return JSON.stringify(value);
    return value;
  } catch {
    return JSON.stringify(value);
  }
}

// Found in the template as written, never in rendered output: a substituted value containing ` #`
// is still a value and has to be quoted, not split. A `#` only starts a comment after whitespace
// and outside the author's quotes, which YAML recognizes only at the start of the value.
function splitComment(written: string): { value: string; comment: string } {
  const masked = tokenize(written)
    .map((token) => (token.kind === "literal" ? token.text : "x".repeat(token.raw.length)))
    .join("");
  if (masked.length !== written.length) return { value: written, comment: "" };
  const quote = masked.at(0);
  const from = quote === '"' || quote === "'" ? closingQuote(masked, quote) : 0;
  const match = /[ \t]+#/.exec(masked.slice(from));
  if (match === null) return { value: written, comment: "" };
  const at = from + match.index;
  return { value: written.slice(0, at), comment: written.slice(at) };
}

function closingQuote(text: string, quote: string): number {
  for (let at = 1; at < text.length; at++) {
    const char = text[at];
    const escaped = quote === '"' ? char === "\\" : char === "'" && text[at + 1] === "'";
    if (escaped) at++;
    else if (char === quote) return at + 1;
  }
  return text.length;
}

function blockScalar(
  prefix: string,
  indent: string,
  extraWidth: number,
  value: string,
  suffix: string,
  eol: LineEnding,
): string {
  // A first line that starts with a space would otherwise set the block's indentation itself.
  const indicator = value.startsWith(" ") ? "|2-" : "|-";
  const pad = `${indent}${" ".repeat(extraWidth)}`;
  const lines = value.split("\n").map((line) => (line === "" ? "" : pad + line));
  return [`${prefix.endsWith(" ") ? prefix : `${prefix} `}${indicator}${suffix}`, ...lines].join(eol);
}

function renderDoubleQuoted(inner: string, render: RenderToken): string {
  const body = tokenize(inner)
    .map((token) =>
      token.kind === "literal" ? token.text : JSON.stringify(normalizeMultiline(render(token))).slice(1, -1),
    )
    .join("");
  return `"${body}"`;
}

function renderSingleQuoted(inner: string, render: RenderToken): string {
  const parts = tokenize(inner).map((token) =>
    token.kind === "literal"
      ? { literal: true, text: token.text }
      : { literal: false, text: normalizeMultiline(render(token)) },
  );
  // A single-quoted scalar folds its line breaks into spaces, so a multi-line value has to move
  // to double quotes to survive.
  if (parts.some((part) => !part.literal && part.text.includes("\n"))) {
    return JSON.stringify(parts.map((part) => (part.literal ? part.text.replaceAll("''", "'") : part.text)).join(""));
  }
  return `'${parts.map((part) => (part.literal ? part.text : part.text.replaceAll("'", "''"))).join("")}'`;
}

function renderEntry(
  indent: string,
  dashRun: string,
  key: string | undefined,
  value: string,
  suffix: string,
  render: RenderToken,
  eol: LineEnding,
): string {
  const prefix = indent + renderTokens(tokenize(dashRun + (key ?? "")), render);
  const tokens = tokenize(value);
  if (tokens.every((token) => token.kind === "literal")) return prefix + value + suffix;
  if (value.length >= 2 && value.startsWith('"') && value.endsWith('"')) {
    return prefix + renderDoubleQuoted(value.slice(1, -1), render) + suffix;
  }
  if (value.length >= 2 && value.startsWith("'") && value.endsWith("'")) {
    return prefix + renderSingleQuoted(value.slice(1, -1), render) + suffix;
  }
  if (value.startsWith("[") || (value.startsWith("{") && !value.startsWith("{{"))) {
    return prefix + renderTokens(tokens, render) + suffix;
  }
  // A block scalar's content must clear the column of whatever line it hangs off: the full dash
  // run (a nested list's innermost `- ` starts only after every outer one) plus, when a key
  // follows the dashes, 2 more to clear the key's own column too.
  const extraWidth = dashRun.length + (key === undefined ? 0 : 2);
  const only = tokens.length === 1 ? tokens[0] : undefined;
  if (only !== undefined && only.kind !== "literal") {
    const whole = normalizeMultiline(render(only));
    return whole.includes("\n")
      ? blockScalar(prefix, indent, extraWidth, whole, suffix, eol)
      : prefix + plainOrQuoted(whole) + suffix;
  }
  const joined = tokens
    .map((token) => (token.kind === "literal" ? token.text : normalizeMultiline(render(token))))
    .join("");
  return prefix + (joined.includes("\n") ? JSON.stringify(joined) : plainOrQuoted(joined)) + suffix;
}

function renderIndented(content: string, render: RenderToken, eol: LineEnding): string {
  let out = "";
  for (const token of tokenize(content)) {
    out += token.kind === "literal" ? token.text : continueMultiline(render(token), out, eol, false);
  }
  return out;
}

// A `<%* ... %>` Templater command can span several lines, and every line inside it is Templater's
// to parse, not ours — escaping a continuation line would rewrite the command's own quotes. A line
// stays open past its end when its last `<%` comes after its last `%>` (an unclosed open), or when
// it was already open and carries no `%>` of its own to close it.
function commandOpenAfter(content: string, wasOpen: boolean): boolean {
  const lastOpen = content.lastIndexOf("<%");
  const lastClose = content.lastIndexOf("%>");
  if (lastOpen === -1) return wasOpen && lastClose === -1;
  return lastOpen > lastClose;
}

/** Renders a template's frontmatter lines so every substituted value reads back as written. */
export function renderFrontmatter(text: string, render: RenderToken, eol: LineEnding): string {
  let out = "";
  let blockIndent: number | undefined;
  let commandOpen = false;
  for (const { content, ending } of linesOf(text)) {
    const indent = INDENT_RE.exec(content)?.[0].length ?? 0;
    // A block-scalar body line is the author's literal text, `<%` included, and it keeps its own
    // indentation regardless: it always renders through renderIndented and never ends the body,
    // even while it also opens or closes a Templater command — only a line at or left of the
    // body's own indentation does that (below). The command state still has to track a `<%`/`%>`
    // on this line, so a command opened inside the body and closed after it still reads as open.
    if (blockIndent !== undefined && (content.trim() === "" || indent > blockIndent)) {
      out += renderIndented(content, render, eol) + ending;
      commandOpen = commandOpenAfter(content, commandOpen);
      continue;
    }
    blockIndent = undefined;
    // Templater runs after this and parses its own commands out of the line, so escaping a value
    // on or inside one would rewrite the command's own quotes.
    if (commandOpen || content.includes("<%")) {
      out += renderTokens(tokenize(content), render) + ending;
      commandOpen = commandOpenAfter(content, commandOpen);
      continue;
    }
    const entry = ENTRY_RE.exec(content);
    if (entry === null) {
      out += renderTokens(tokenize(content), render) + ending;
      continue;
    }
    const [, lineIndent = "", dashRun = "", key, written = "", trailing = ""] = entry;
    // A value that already starts with `#` in the template itself is a comment the author wrote,
    // not a value the engine owns — render the line as renderString would rather than quoting it.
    // A rendered value that only starts with `#` after substitution is handled by plainOrQuoted.
    if ((dashRun === "" && key === undefined) || written.startsWith("#")) {
      out += renderTokens(tokenize(content), render) + ending;
      continue;
    }
    const { value, comment } = splitComment(written);
    if (BLOCK_INDICATOR_RE.test(value)) blockIndent = indent;
    const suffix = renderTokens(tokenize(comment), render) + trailing;
    out += renderEntry(lineIndent, dashRun, key, value, suffix, render, eol) + ending;
  }
  return out;
}
