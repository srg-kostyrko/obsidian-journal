const THEME_VARIABLE = /^var\((--[\w-]+)\)$/;

const INHERITED: Readonly<Record<string, string>> = {
  weight: "font-weight",
  italic: "font-style",
  case: "text-transform",
  color: "color",
};

/** The computed property a text leaf's `inherit` stock takes from the preview. */
export function inheritedProperty(leaf: string): string | undefined {
  return INHERITED[leaf];
}

/**
 * The CSS value a stock renders as: a theme variable as the body defines it, `inherit` as the
 * preview inherits it, since a theme can change either.
 */
export function resolveStock(
  stock: string,
  readVariable: (name: string) => string,
  inherited: string | undefined,
): string | undefined {
  const variable = THEME_VARIABLE.exec(stock);
  let resolved: string | undefined = stock;
  if (stock === "inherit") resolved = inherited;
  else if (variable?.[1] !== undefined) resolved = readVariable(variable[1]);
  const trimmed = resolved?.trim();
  return trimmed === undefined || trimmed === "" ? undefined : trimmed;
}

const WEIGHT_KEYWORDS: Readonly<Record<string, number>> = { normal: 400, bold: 700 };
const WEIGHT_VARIABLES = [
  ["normal", "--font-normal"],
  ["semibold", "--font-semibold"],
  ["bold", "--font-bold"],
] as const;

function weightNumber(value: string): number | undefined {
  const keyword = WEIGHT_KEYWORDS[value];
  if (keyword !== undefined) return keyword;
  const number = Number(value);
  return value === "" || Number.isNaN(number) ? undefined : number;
}

// A theme picks its own numbers for the three weights, so the nearest of them names the value.
function weightOption(value: string, readVariable: (name: string) => string): string | undefined {
  const target = weightNumber(value);
  if (target === undefined) return undefined;
  let best: { option: string; distance: number } | undefined;
  for (const [option, variable] of WEIGHT_VARIABLES) {
    const weight = weightNumber(readVariable(variable).trim());
    if (weight === undefined) continue;
    const distance = Math.abs(weight - target);
    if (best === undefined || distance < best.distance) best = { option, distance };
  }
  return best?.option;
}

function italicOption(value: string): string | undefined {
  if (value === "normal") return "off";
  return value === "italic" || value.startsWith("oblique") ? "on" : undefined;
}

const CASES: Readonly<Record<string, string>> = {
  none: "none",
  uppercase: "upper",
  lowercase: "lower",
  capitalize: "title",
};

/** The option a select leaf offers for a resolved CSS value, if one names it. */
export function stockOption(leaf: string, value: string, readVariable: (name: string) => string): string | undefined {
  switch (leaf) {
    case "weight": {
      return weightOption(value, readVariable);
    }
    case "italic": {
      return italicOption(value);
    }
    case "case": {
      return CASES[value];
    }
    default: {
      return undefined;
    }
  }
}
