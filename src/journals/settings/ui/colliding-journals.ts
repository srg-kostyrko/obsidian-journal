import { CalendarDate } from "@/calendar";
import type { AnchorString } from "@/calendar";

import type { JournalConfig } from "../../config";
import type { CycleService } from "../../cycle";
import type { FrontmatterService } from "../../frontmatter";
import type { NotePathService, PathInverter } from "../../notes/note-path";
import type { TimelineService } from "../../timeline";

export interface CollisionServices {
  cycle: CycleService;
  frontmatter: FrontmatterService;
  paths: NotePathService;
  timeline: TimelineService;
}

// Every pair is probed from both sides, so it is the coarser journal's run that has to reach a
// period the two share — a year's first day, a quarter's first month, a week's first day. Any run
// of fourteen fixed periods holds one of each of those.
const SAMPLE_PERIODS = 14;

/** Journals that write a note another journal would also read back as its own, grouped. */
export function findCollidingJournals(
  configs: readonly JournalConfig[],
  { cycle, frontmatter, paths, timeline }: CollisionServices,
  today: CalendarDate,
): JournalConfig[][] {
  // Settings alone cannot answer this: a template carrying its own date format ignores the
  // journal's default one, and a day and a week journal share a path on the week's first day.
  const inverters = new Map<string, PathInverter>();
  for (const config of configs) {
    const inverter = paths.inverterFor(config.name).getOrUndefined();
    if (inverter) inverters.set(config.name, inverter);
  }

  const groupOf = new Map<string, Set<string>>();
  const join = (a: string, b: string): void => {
    const merged = new Set([...(groupOf.get(a) ?? [a]), ...(groupOf.get(b) ?? [b])]);
    for (const member of merged) groupOf.set(member, merged);
  };

  // Reading a path back is the only way to catch journals whose periods differ, but it needs a
  // template that inverts. A clone keeps its source's template, so where that template cannot be
  // read back neither journal has an inverter and the probe below sees nothing — while the two
  // still write one path per period. Two journals that render the same path collide whatever
  // their templates do, so that is checked on its own.
  const pathOwners = new Map<string, string>();

  for (const config of configs) {
    const { name } = config;
    for (let anchor of runStartsOf(config, cycle, today)) {
      for (let steps = 0; anchor !== undefined && steps < SAMPLE_PERIODS; steps++) {
        if (!timeline.contains(name, anchor)) break;
        const path = frontmatter.buildMetadata(name, anchor).flatMap((metadata) => paths.pathFor(name, metadata));
        if (path.isOk()) {
          const owner = pathOwners.get(path.value);
          if (owner === undefined) pathOwners.set(path.value, name);
          else if (owner !== name) join(name, owner);
          for (const [other, inverter] of inverters) {
            if (other === name || groupOf.get(name)?.has(other)) continue;
            const candidate = inverter.invert(path.value);
            if (candidate.isSome() && timeline.contains(other, candidate.value.anchor)) join(name, other);
          }
        }
        const next: AnchorString | undefined = cycle.nextAnchor(name, anchor).getOrUndefined();
        anchor = next !== undefined && next > anchor ? next : undefined;
      }
    }
  }

  return [...new Set(groupOf.values())].map((group) => configs.filter((config) => group.has(config.name)));
}

// One run at today's period, pulled inside the journal's timeline: a journal that has ended or
// not started yet still wrote, or will write, notes a neighbor could take. An ended journal's run
// ends at its last period instead of starting there.
//
// A custom interval shares no rhythm with any fixed cycle, so fourteen of its periods around today
// need not meet a neighbor's start at all. It lines up where it was set up to — its own start, the
// day a journal of another cycle usually starts too — so its run from there is probed as well.
function runStartsOf(config: JournalConfig, cycle: CycleService, today: CalendarDate): (AnchorString | undefined)[] {
  const { name } = config;
  const { start, end } = config.timeline;
  const todayAnchor = today.toAnchor();
  const fromStart = start === "" ? undefined : cycle.anchorOf(name, CalendarDate.fromAnchor(start)).getOrUndefined();
  const extra = config.write.type === "custom" ? [fromStart] : [];
  if (start !== "" && start > todayAnchor) return [fromStart];
  if (end.kind !== "date" || end.date === "" || end.date >= todayAnchor) {
    return [cycle.anchorOf(name, today).getOrUndefined(), ...extra];
  }
  let anchor = cycle.anchorOf(name, CalendarDate.fromAnchor(end.date)).getOrUndefined();
  for (let steps = 1; anchor !== undefined && steps < SAMPLE_PERIODS; steps++) {
    const previous = cycle.previousAnchor(name, anchor).getOrUndefined();
    if (previous === undefined || previous >= anchor) break;
    anchor = previous;
  }
  return [anchor, ...extra];
}
