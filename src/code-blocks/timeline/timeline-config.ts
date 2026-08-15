import * as v from "valibot";

import { asFenceString, asRecord } from "../fence-record";

export const timelineModes = ["week", "month", "quarter", "calendar"] as const;

export type TimelineMode = (typeof timelineModes)[number];

const weekPlacements = ["default", "none", "left", "right"] as const;

type WeekPlacementOption = (typeof weekPlacements)[number];

function asTimelineMode(value: unknown): TimelineMode | undefined {
  return typeof value === "string" && (timelineModes as readonly string[]).includes(value)
    ? (value as TimelineMode)
    : undefined;
}

function asWeekPlacement(value: unknown): WeekPlacementOption | undefined {
  return typeof value === "string" && (weekPlacements as readonly string[]).includes(value)
    ? (value as WeekPlacementOption)
    : undefined;
}

function isWeekdayIndex(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 && value <= 6;
}

function asPadding(value: unknown): number | undefined {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : undefined;
}

const timelineBlockEntries = {
  // Every key degrades rather than erroring: a typo in one option must not blank the whole
  // block into an error panel, which is the rule the home fence follows and mode already did.
  // An unknown mode parses to unset so the journal-derived mode applies.
  mode: v.pipe(v.optional(v.unknown()), v.transform(asTimelineMode)),
  shelf: v.optional(v.pipe(v.unknown(), v.transform(asFenceString))),
  // An unknown placement is unset, so the configured default applies — as for mode.
  weeks: v.pipe(v.optional(v.unknown()), v.transform(asWeekPlacement)),
  // Out-of-range entries drop out and the rest still apply, mirroring the home fence's `show`;
  // a non-array degrades to unset.
  hiddenWeekdays: v.pipe(
    v.optional(v.unknown()),
    v.transform((value) => (Array.isArray(value) ? value.filter(isWeekdayIndex) : undefined)),
  ),
  // Padding applies to the week and month modes only — quarter and calendar never receive
  // it, so a value set under them is inert rather than reported as an unrecognized key.
  before: v.pipe(v.optional(v.unknown()), v.transform(asPadding)),
  after: v.pipe(v.optional(v.unknown()), v.transform(asPadding)),
};

export const timelineBlockSchema = v.pipe(v.unknown(), v.transform(asRecord), v.object(timelineBlockEntries));

// Derived from the entries so the two can never drift: the block reports any other key as
// unrecognized rather than ignoring it and rendering a plausible-looking default.
export const timelineBlockKeys = Object.keys(timelineBlockEntries);

export type TimelineBlockConfig = v.InferOutput<typeof timelineBlockSchema>;
