import type { Modifier, Token, TokenStream, Unit } from "./types";

const MODIFIER_RE = /^([+-])(\d+)([yqmwdh])$/;
const BOUNDARY_RE = /^<(startOf|endOf)=([a-zA-Z]+)>$/;
const KNOWN_UNITS: ReadonlySet<Unit> = new Set(["y", "q", "m", "w", "d", "h"]);

export function tokenize(template: string): TokenStream {
  const tokens: Token[] = [];
  let i = 0;
  let literalStart = 0;

  while (i < template.length) {
    if (template[i] === "{" && template[i + 1] === "{") {
      const close = template.indexOf("}}", i + 2);
      if (close === -1) break; // unclosed → fall through to literal at end
      const inner = template.slice(i + 2, close);
      const parsed = parseTokenInner(inner, template.slice(i, close + 2));
      if (parsed) {
        if (literalStart < i) {
          tokens.push({ kind: "literal", text: template.slice(literalStart, i) });
        }
        tokens.push(parsed);
        i = close + 2;
        literalStart = i;
        continue;
      }
      // malformed → emit `{{...}}` as part of the surrounding literal
      i = close + 2;
      continue;
    }
    i++;
  }

  if (literalStart < template.length) {
    tokens.push({ kind: "literal", text: template.slice(literalStart) });
  }
  return tokens;
}

const NAME_PREFIX_RE = /^([a-zA-Z_][a-zA-Z0-9_]*)/;
const ARITH_PREFIX_RE = /^([+-]\d+[a-z])/;
const BOUNDARY_PREFIX_RE = /^(<[a-zA-Z]+=[a-zA-Z]+>)/;
// The `\d` in the lookahead is load-bearing: for a maximal digit run, ARITH_PREFIX_RE
// matches iff the next character is a letter and this matches iff it is not, so the two
// are mutually exclusive. Weakened to `(?![a-z])`, `\d+` backtracks one digit and `+34d`
// matches as an offset of `+3`, dropping every multi-digit date shift.
const OFFSET_PREFIX_RE = /^([+-]\d+)(?![\da-z])/;

function parseTokenInner(inner: string, raw: string): Token | undefined {
  let rest = inner.trim();
  // name
  const nameMatch = NAME_PREFIX_RE.exec(rest);
  if (!nameMatch) return undefined;
  const name = nameMatch[1];
  rest = rest.slice(name.length);

  // optional (argument)
  let argument: string | undefined;
  if (rest.startsWith("(")) {
    const closeParen = rest.indexOf(")");
    if (closeParen === -1) return undefined;
    argument = rest.slice(1, closeParen).trim();
    rest = rest.slice(closeParen + 1);
  }
  rest = rest.trimStart();

  // optional modifiers (any order; we walk eagerly)
  const modifiers: Modifier[] = [];
  while (rest.length > 0 && !rest.startsWith(":") && !rest.startsWith("}")) {
    const arithMatch = ARITH_PREFIX_RE.exec(rest);
    const boundaryMatch = BOUNDARY_PREFIX_RE.exec(rest);
    const offsetMatch = OFFSET_PREFIX_RE.exec(rest);
    if (arithMatch) {
      const modifierText = arithMatch[1];
      const modifierParts = MODIFIER_RE.exec(modifierText);
      if (!modifierParts) return undefined;
      const unit = modifierParts[3] as Unit;
      if (!KNOWN_UNITS.has(unit)) return undefined;
      modifiers.push({
        kind: "shift",
        sign: modifierParts[1] === "+" ? 1 : -1,
        amount: Number.parseInt(modifierParts[2], 10),
        unit,
      });
      rest = rest.slice(modifierText.length).trimStart();
    } else if (boundaryMatch) {
      const boundaryText = boundaryMatch[1];
      const boundaryParts = BOUNDARY_RE.exec(boundaryText);
      if (!boundaryParts) return undefined;
      modifiers.push({
        kind: "boundary",
        direction: boundaryParts[1] === "startOf" ? "start" : "end",
        unit: boundaryParts[2],
      });
      rest = rest.slice(boundaryText.length).trimStart();
    } else if (offsetMatch) {
      const offsetText = offsetMatch[1];
      modifiers.push({
        kind: "offset",
        sign: offsetText.startsWith("+") ? 1 : -1,
        amount: Number.parseInt(offsetText.slice(1), 10),
      });
      rest = rest.slice(offsetText.length).trimStart();
    } else {
      return undefined; // unparsable junk
    }
  }

  // optional :format
  let format: string | undefined;
  if (rest.startsWith(":")) {
    format = rest.slice(1);
    rest = "";
  }
  if (rest.trim().length > 0) return undefined;

  if (argument !== undefined) {
    return { kind: "function", name, arg: argument, modifiers, format, raw };
  }
  return { kind: "variable", name, modifiers, format, raw };
}
