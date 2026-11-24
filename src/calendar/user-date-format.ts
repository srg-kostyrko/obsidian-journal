import * as v from "valibot";

export type UserDateFormat = string & { readonly __brand: "UserDateFormat" };

export function userDateFormat(pattern: string): UserDateFormat {
  return pattern as UserDateFormat;
}

export const userDateFormatSchema = v.pipe(v.string(), v.transform(userDateFormat));

// A pattern a user typed can make moment throw, so the plain `format` refuses it at compile time.
export type PlainFormatPattern<P extends string> = P & (P extends UserDateFormat ? never : unknown);
