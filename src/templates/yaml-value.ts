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

function blockScalar(prefix: string, indent: string, extraWidth: number, value: string, eol: LineEnding): string {
  // A first line that starts with a space would otherwise set the block's indentation itself.
  const indicator = value.startsWith(" ") ? "|2-" : "|-";
  const pad = `${indent}${" ".repeat(extraWidth)}`;
  const lines = value.split("\n").map((line) => (line === "" ? "" : pad + line));
  return [`${prefix.endsWith(" ") ? prefix : `${prefix} `}${indicator}`, ...lines].join(eol);
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
  render: RenderToken,
  eol: LineEnding,
): string {
  const prefix = indent + renderTokens(tokenize(dashRun + (key ?? "")), render);
  const tokens = tokenize(value);
  if (tokens.every((token) => token.kind === "literal")) return prefix + value;
  if (value.length >= 2 && value.startsWith('"') && value.endsWith('"')) {
    return prefix + renderDoubleQuoted(value.slice(1, -1), render);
  }
  if (value.length >= 2 && value.startsWith("'") && value.endsWith("'")) {
    return prefix + renderSingleQuoted(value.slice(1, -1), render);
  }
  if (value.startsWith("[") || (value.startsWith("{") && !value.startsWith("{{"))) {
    return prefix + renderTokens(tokens, render);
  }
  // A block scalar's content must clear the column of whatever line it hangs off: the full dash
  // run (a nested list's innermost `- ` starts only after every outer one) plus, when a key
  // follows the dashes, 2 more to clear the key's own column too.
  const extraWidth = dashRun.length + (key === undefined ? 0 : 2);
  const only = tokens.length === 1 ? tokens[0] : undefined;
  if (only !== undefined && only.kind !== "literal") {
    const whole = normalizeMultiline(render(only));
    return whole.includes("\n") ? blockScalar(prefix, indent, extraWidth, whole, eol) : prefix + plainOrQuoted(whole);
  }
  const joined = tokens
    .map((token) => (token.kind === "literal" ? token.text : normalizeMultiline(render(token))))
    .join("");
  return prefix + (joined.includes("\n") ? JSON.stringify(joined) : plainOrQuoted(joined));
}

function renderIndented(content: string, render: RenderToken, eol: LineEnding): string {
  let out = "";
  for (const token of tokenize(content)) {
    out += token.kind === "literal" ? token.text : continueMultiline(render(token), out, eol, false);
  }
  return out;
}

/** Renders a template's frontmatter lines so every substituted value reads back as written. */
export function renderFrontmatter(text: string, render: RenderToken, eol: LineEnding): string {
  let out = "";
  let blockIndent: number | undefined;
  for (const { content, ending } of linesOf(text)) {
    const indent = INDENT_RE.exec(content)?.[0].length ?? 0;
    if (blockIndent !== undefined && (content.trim() === "" || indent > blockIndent)) {
      out += renderIndented(content, render, eol) + ending;
      continue;
    }
    blockIndent = undefined;
    const entry = ENTRY_RE.exec(content);
    if (entry === null) {
      out += renderTokens(tokenize(content), render) + ending;
      continue;
    }
    const [, lineIndent = "", dashRun = "", key, value = "", trailing = ""] = entry;
    // A value that already starts with `#` in the template itself is a comment the author wrote,
    // not a value the engine owns — render the line as renderString would rather than quoting it.
    // A rendered value that only starts with `#` after substitution is handled by plainOrQuoted.
    if ((dashRun === "" && key === undefined) || value.startsWith("#")) {
      out += renderTokens(tokenize(content), render) + ending;
      continue;
    }
    if (BLOCK_INDICATOR_RE.test(value)) blockIndent = indent;
    out += renderEntry(lineIndent, dashRun, key, value, render, eol) + trailing + ending;
  }
  return out;
}
