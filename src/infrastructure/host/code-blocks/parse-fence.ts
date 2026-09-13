import { parseYaml } from "obsidian";

import { CodeBlockYamlError } from "./errors";

export type ParsedFenceSource = { kind: "ok"; value: unknown } | { kind: "err"; error: CodeBlockYamlError };

export function parseFenceSource(source: string): ParsedFenceSource {
  if (source.trim() === "") return { kind: "ok", value: {} };
  try {
    return { kind: "ok", value: parseYaml(source.replaceAll("\t", "  ")) };
  } catch (error) {
    return { kind: "err", error: new CodeBlockYamlError(error) };
  }
}

// Only a block that declares its options can tell a typo from a key it never had.
export function unknownFenceKeys(knownKeys: readonly string[] | undefined, parsed: unknown): string[] {
  if (knownKeys === undefined) return [];
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return [];
  return Object.keys(parsed).filter((key) => !knownKeys.includes(key));
}
