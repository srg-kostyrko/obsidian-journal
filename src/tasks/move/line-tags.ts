// What follows mirrors the tag tokenizer of Obsidian's metadata worker (worker.js, 1.8.7 through 1.14.4),
// since the checkbox provider reads the rolled marker from the tags metadataCache lists: a line this reads
// differently either rolls a second time or never leaves the structure-in-sync check. A `#` starts a tag
// only where the worker's inline parser tries the tokenizer — the line's start, after whitespace, or
// straight after another inline element — and never after a bare character, `(` and `x` alike.
const TAG_END = /[\u{2000}-\u{206F}\u{2E00}-\u{2E7F}'!"#$%&()*+,.:;<=>?@^`{|}~[\]\\\s]/u;
const ALL_DIGITS = /^#\p{N}+$/u;
const WHITESPACE = /\s/u;

// Code, math, wikilinks, comments and HTML tags hide a `#` inside them, and each, like a link's
// destination, is an element a tag may follow.
const OPAQUE =
  /(`+)[\s\S]*?(?<!`)\1(?!`)|\]\((?:<[^>]*>|[^()\s]*)(?:\s+"[^"]*")?\)|\$(?!\s)[^$]*?(?<!\s)\$(?!\d)|\[\[[\s\S]*?\]\]|<!--[\s\S]*?-->|<\/?[A-Za-z][^>]*>|\\./uy;

const DELIMITERS = new Set(["*", "_", "=", "~", "%", "[", "]"]);
const PAIRED = ["**", "__", "~~", "==", "%%", "*", "_", "[", "]"] as const;

// A delimiter only bounds an element when it pairs up, so `**#tag**` is a tag and `**#tag` is not, and
// a `]` closes only the nearest bracket — never a checkbox's, which is not inline text at all.
function pairs(line: string, at: number, hash: number, token: string): boolean {
  if (token === "[") return line.includes("]", hash);
  if (token === "]") return line.lastIndexOf("[", at) > line.lastIndexOf("]", at - 1);
  return line.lastIndexOf(token, at - token.length) !== -1 || line.includes(token, hash);
}

function delimiterRun(line: string, hash: number): string[] | null {
  let runStart = hash;
  while (runStart > 0 && DELIMITERS.has(line.charAt(runStart - 1))) runStart--;
  if (runStart === hash) return null;
  const tokens: string[] = [];
  for (let at = runStart; at < hash;) {
    const token = PAIRED.find((candidate) => line.startsWith(candidate, at));
    if (token === undefined || !pairs(line, at, hash, token)) return null;
    tokens.push(token);
    at += token.length;
  }
  return tokens;
}

function tagAt(line: string, hash: number): number {
  let end = hash + 1;
  while (end < line.length && !TAG_END.test(line.charAt(end))) end++;
  return end;
}

/** Whether Obsidian reads `tag` as a whole inline tag on this line, case-insensitively. */
export function lineHasTag(line: string, tag: string): boolean {
  if (tag === "") return false;
  const wanted = tag.toLowerCase();
  let boundary = 0;
  for (let at = 0; at < line.length;) {
    OPAQUE.lastIndex = at;
    const opaque = OPAQUE.exec(line);
    if (opaque !== null) {
      at += opaque[0].length;
      boundary = at;
      continue;
    }
    if (line.charAt(at) !== "#") {
      at++;
      continue;
    }
    const run = at === boundary || WHITESPACE.test(line.charAt(at - 1)) ? [] : delimiterRun(line, at);
    if (run === null) {
      at++;
      continue;
    }
    const end = tagAt(line, at);
    let text = line.slice(at, end);
    // `_` is legal inside a tag, so an underscore emphasis closing over one is parsed first and trimmed off it.
    const underscores = run.join("").replaceAll(/[^_]/gu, "");
    if (underscores !== "" && text.endsWith(underscores) && text.length > underscores.length + 1) {
      text = text.slice(0, -underscores.length);
    }
    if (text.length > 1 && !ALL_DIGITS.test(text)) {
      if (text.toLowerCase() === wanted) return true;
      boundary = end;
    }
    at = end;
  }
  return false;
}
