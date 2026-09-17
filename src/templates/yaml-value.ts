import { parseYaml } from "obsidian";

import { tokenize } from "./grammar";
import { continueMultiline, normalizeMultiline, type LineEnding } from "./multiline";

import type { RenderToken, Token } from "./types";

const ENTRY_RE =
  /^([ \t]*)((?:- +)*)((?:[^\s#'"{[\]:][^:]*?|"(?:[^"\\]|\\.)*"[ \t]*|'(?:[^']|'')*'[ \t]*):(?: +|$))?(.*?)([ \t]*)$/;
const BLOCK_INDICATOR_RE = /^[|>][+-]?\d?[+-]?$/;
const INDENT_RE = /^[ \t]*/;
const FLOW_INDICATOR_RE = /^(?:\?(?:\s|$)|[!&])/;
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
  const masked = mask(written);
  if (masked === undefined) return { value: written, comment: "" };
  const from =
    masked.startsWith('"') || masked.startsWith("'") || masked.startsWith("[") || masked.startsWith("{")
      ? (scalarEnd(masked) ?? masked.length)
      : 0;
  const match = /[ \t]+#/.exec(masked.slice(from));
  if (match === null) return { value: written, comment: "" };
  const at = from + match.index;
  return { value: written.slice(0, at), comment: written.slice(at) };
}

// The template's text with every `{{…}}` blanked out, so structure is read from what the author
// wrote and never from a substituted value.
function mask(text: string): string | undefined {
  const masked = tokenize(text)
    .map((token) => (token.kind === "literal" ? token.text : "x".repeat(token.raw.length)))
    .join("");
  return masked.length === text.length ? masked : undefined;
}

function closingQuote(text: string, quote: string, open = 0): number | undefined {
  for (let at = open + 1; at < text.length; at++) {
    const char = text[at];
    const escaped = quote === '"' ? char === "\\" : char === "'" && text[at + 1] === "'";
    if (escaped) at++;
    else if (char === quote) return at + 1;
  }
  return undefined;
}

// For each position: whether it sits outside every quoted scalar and nested flow collection.
// Undefined when the brackets or quotes don't balance, or a comment starts inside a collection.
// A quote opens a scalar only where one can start in flow context — `it's` is a plain scalar.
function topLevel(masked: string): boolean[] | undefined {
  const top: boolean[] = [];
  const open: string[] = [];
  let previous = "";
  for (let at = 0; at < masked.length; at++) {
    const char = masked.charAt(at);
    if (char === "#" && at > 0 && /\s/.test(masked.charAt(at - 1))) {
      if (open.length > 0) return undefined;
      break;
    }
    if ((char === '"' || char === "'") && (previous === "" || "[{,:?".includes(previous))) {
      const end = closingQuote(masked, char, at);
      if (end === undefined) return undefined;
      for (let inside = at; inside < end; inside++) top[inside] = false;
      at = end - 1;
      previous = char;
      continue;
    }
    if (char === "[" || char === "{") {
      top[at] = open.length === 0;
      open.push(char === "[" ? "]" : "}");
    } else if (char === "]" || char === "}") {
      if (open.pop() !== char) return undefined;
      top[at] = open.length === 0;
    } else {
      top[at] = open.length === 0;
    }
    if (!/\s/.test(char)) previous = char;
  }
  return open.length === 0 ? top : undefined;
}

// Where a value that opens with a quote or a flow bracket closes, or undefined if it never does.
function scalarEnd(masked: string): number | undefined {
  const first = masked.charAt(0);
  if (first === '"' || first === "'") return closingQuote(masked, first);
  const top = topLevel(masked);
  const close = top?.indexOf(true, 1) ?? -1;
  return close === -1 ? undefined : close + 1;
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

// Kept as written when it reads back as itself, or as a typed value, as the one item of a flow
// sequence. An item that would split, close the collection early, or become a mapping is quoted.
// An empty item stays empty, as an empty value outside a collection does.
function flowPlainOrQuoted(value: string): string {
  if (value.trim() === "") return value;
  try {
    const read = (parseYaml(`value: [${value}]`) as Record<string, unknown> | null)?.value;
    if (!Array.isArray(read) || read.length !== 1) return JSON.stringify(value);
    const item: unknown = read[0];
    if (typeof item === "string") return item === value ? value : JSON.stringify(value);
    if (item === null || item === undefined) return NULL_WORDS.has(value) ? value : JSON.stringify(value);
    if (typeof item === "object" && !Array.isArray(item) && !value.startsWith("{")) return JSON.stringify(value);
    return value;
  } catch {
    return JSON.stringify(value);
  }
}

function renderFlowValue(value: string, masked: string, render: RenderToken): string {
  const end = scalarEnd(masked);
  if (end === undefined) return renderTokens(tokenize(value), render);
  return (
    renderFlowCollection(value.slice(0, end), masked.slice(0, end), render) +
    renderTokens(tokenize(value.slice(end)), render)
  );
}

// Items split on the commas the template itself wrote, so a substituted comma stays inside its item.
function renderFlowCollection(written: string, masked: string, render: RenderToken): string {
  const inner = written.slice(1, -1);
  const innerMasked = masked.slice(1, -1);
  const top = topLevel(innerMasked) ?? [];
  const inMapping = written.startsWith("{");
  const items: string[] = [];
  let from = 0;
  for (let at = 0; at <= inner.length; at++) {
    if (at < inner.length && !(top.at(at) === true && innerMasked[at] === ",")) continue;
    items.push(renderFlowItem(inner.slice(from, at), innerMasked.slice(from, at), inMapping, render));
    from = at + 1;
  }
  return written.charAt(0) + items.join(",") + written.at(-1);
}

function renderFlowItem(written: string, masked: string, inMapping: boolean, render: RenderToken): string {
  if (tokenize(written).every((token) => token.kind === "literal")) return written;
  const start = written.length - written.trimStart().length;
  const end = written.trimEnd().length;
  const core = written.slice(start, end);
  const coreMasked = masked.slice(start, end);
  // An explicit key, a tag or an anchor belongs to what follows it; escaping would quote it in.
  if (FLOW_INDICATOR_RE.test(coreMasked)) return renderTokens(tokenize(written), render);
  const top = topLevel(coreMasked) ?? [];
  // A JSON-style quoted key needs no space after its colon.
  const quotedKeyEnd = /^["']/.test(coreMasked) ? scalarEnd(coreMasked) : undefined;
  const colon =
    quotedKeyEnd !== undefined && coreMasked.charAt(quotedKeyEnd) === ":"
      ? quotedKeyEnd
      : [...coreMasked].findIndex(
          (char, at) =>
            char === ":" &&
            top.at(at) === true &&
            (at + 1 === coreMasked.length || /\s/.test(coreMasked.charAt(at + 1))),
        );
  if (colon === -1 && inMapping) return renderTokens(tokenize(written), render);
  const valueFrom = colon === -1 ? 0 : colon + 1 + (/^\s*/.exec(core.slice(colon + 1))?.[0].length ?? 0);
  return (
    written.slice(0, start) +
    renderTokens(tokenize(core.slice(0, valueFrom)), render) +
    renderFlowScalar(core.slice(valueFrom), coreMasked.slice(valueFrom), render) +
    written.slice(end)
  );
}

function renderFlowScalar(value: string, masked: string, render: RenderToken): string {
  const tokens = tokenize(value);
  if (tokens.every((token) => token.kind === "literal")) return value;
  if (FLOW_INDICATOR_RE.test(masked)) return renderTokens(tokens, render);
  const closesAtEnd = scalarEnd(masked) === masked.length;
  if (closesAtEnd && masked.startsWith('"')) return renderDoubleQuoted(value.slice(1, -1), render);
  if (closesAtEnd && masked.startsWith("'")) return renderSingleQuoted(value.slice(1, -1), render);
  if (masked.startsWith("[") || masked.startsWith("{")) {
    return closesAtEnd ? renderFlowCollection(value, masked, render) : renderTokens(tokens, render);
  }
  const joined = tokens
    .map((token) => (token.kind === "literal" ? token.text : normalizeMultiline(render(token))))
    .join("");
  return joined.includes("\n") ? JSON.stringify(joined) : flowPlainOrQuoted(joined);
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
  const masked = mask(value);
  if (masked?.startsWith("[") === true || masked?.startsWith("{") === true) {
    return prefix + renderFlowValue(value, masked, render) + suffix;
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

// How many flow collections are still open after this line, read from the template's own text. A
// bracket opens one only at the start of a value, or anywhere inside a collection already open.
function flowDepthAfter(content: string, depth: number): number {
  const masked = mask(content);
  if (masked === undefined) return depth;
  let open = depth;
  let previous = "";
  for (let at = 0; at < masked.length; at++) {
    const char = masked.charAt(at);
    const afterSpace = at === 0 || /\s/.test(masked.charAt(at - 1));
    if (char === "#" && afterSpace) break;
    if ((char === '"' || char === "'") && (previous === "" || "[{,:?-".includes(previous))) {
      const end = closingQuote(masked, char, at);
      if (end === undefined) break;
      at = end - 1;
    } else if (char === "[" || char === "{") {
      if (open > 0 || (afterSpace && (previous === "" || ":-?".includes(previous)))) open++;
    } else if ((char === "]" || char === "}") && open > 0) {
      open--;
    }
    if (!/\s/.test(char)) previous = char;
  }
  return open;
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
  let flowDepth = 0;
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
      if (flowDepth > 0) flowDepth = flowDepthAfter(content, flowDepth);
      continue;
    }
    blockIndent = undefined;
    // Templater runs after this and parses its own commands out of the line, so escaping a value
    // on or inside one would rewrite the command's own quotes.
    if (commandOpen || content.includes("<%")) {
      out += renderTokens(tokenize(content), render) + ending;
      commandOpen = commandOpenAfter(content, commandOpen);
      flowDepth = flowDepthAfter(content, flowDepth);
      continue;
    }
    // A flow collection spanning several lines is left as renderString would leave it: its lines
    // are not entries, and the line that opens it can't be escaped without its closing bracket.
    const depthBefore = flowDepth;
    flowDepth = flowDepthAfter(content, flowDepth);
    if (depthBefore > 0 || flowDepth > 0) {
      out += renderTokens(tokenize(content), render) + ending;
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
