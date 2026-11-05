const NUMBER_WITH_UNIT = /^(-?\d*\.?\d+)(px|em|rem|%)$/;
const THEME_VARIABLE = /^var\((--[\w-]+)\)$/;

/**
 * The number a stock CSS value renders as, in the slider's unit, so the slider can sit on it.
 * Theme variables are read where the editor renders, since a theme can redefine them.
 */
export function stockNumber(
  stock: string,
  unit: string,
  readVariable: (name: string) => string,
  rootFontPx = 16,
): number | undefined {
  if (stock === "inherit") return unit === "em" ? 1 : undefined;
  const variable = THEME_VARIABLE.exec(stock);
  const resolved = variable?.[1] === undefined ? stock : readVariable(variable[1]).trim();
  const match = NUMBER_WITH_UNIT.exec(resolved);
  if (match === null) return undefined;
  const value = Number(match[1]);
  if (match[2] === unit) return value;
  if (match[2] === "rem" && unit === "px") return value * rootFontPx;
  return undefined;
}
