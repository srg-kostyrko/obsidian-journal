import { beforeAll, describe, expect, it, vi } from "vitest";
import { defineComponent } from "vue";

import type { AnchorString } from "@/calendar";
import { commandsCoreModule } from "@/commands/module";
import { initLocale } from "@/i18n";
import { Flows } from "@/infrastructure/flows";
import { WorkspaceService } from "@/infrastructure/host";
import { AsyncResult } from "@/infrastructure/result";
import { CreateNoteletFlow } from "@/journals";
import { journalsCoreModule } from "@/journals/module";
import { buildNoteletType, fixedJournal } from "@/journals/testing";
import { testContainer, type TestHarness } from "@/testing";

import { useNoteletCreation, type NoteletCreationControl, type NoteletCreationPlacement } from "./use-notelet-creation";

const ANCHOR = "2026-08-12" as AnchorString;

function journalWithTypes(name: string, types: Record<string, { name: string }>) {
  return fixedJournal(
    name,
    { type: "day" },
    {
      notelets: Object.fromEntries(
        Object.entries(types).map(([id, type]) => [id, buildNoteletType({ id: id as never, name: type.name })]),
      ),
    },
  );
}

async function mountControl(options: {
  journals: Record<string, ReturnType<typeof journalWithTypes>>;
  placements: readonly NoteletCreationPlacement[];
  typeIds?: readonly string[];
}): Promise<{ harness: TestHarness; control: NoteletCreationControl }> {
  const harness = await testContainer({
    modules: [journalsCoreModule, commandsCoreModule],
    data: { journals: options.journals, commands: {} },
  });
  let control!: NoteletCreationControl;
  const Probe = defineComponent({
    setup() {
      control = useNoteletCreation(
        () => options.placements,
        () => options.typeIds,
      );
      return undefined;
    },
    template: "<div />",
  });
  harness.render(Probe, { props: {} });
  return { harness, control };
}

describe("useNoteletCreation", () => {
  beforeAll(() => initLocale("en"));

  it("offers every type of every placed journal", async () => {
    const { control } = await mountControl({
      journals: { Daily: journalWithTypes("Daily", { nt_a: { name: "Meeting" }, nt_b: { name: "Gym" } }) },
      placements: [{ journalName: "Daily", anchor: ANCHOR }],
    });
    expect(control.targets.value.map((t) => t.typeName)).toEqual(["Gym", "Meeting"]);
  });

  it("keeps only the filtered types", async () => {
    const { control } = await mountControl({
      journals: { Daily: journalWithTypes("Daily", { nt_a: { name: "Meeting" }, nt_b: { name: "Gym" } }) },
      placements: [{ journalName: "Daily", anchor: ANCHOR }],
      typeIds: ["nt_a"],
    });
    expect(control.targets.value.map((t) => t.typeName)).toEqual(["Meeting"]);
  });

  it("omits a journal whose timeline does not reach the placement", async () => {
    const open = journalWithTypes("Daily", { nt_a: { name: "Meeting" } });
    const closed = {
      ...open,
      timeline: {
        start: "2020-01-01" as AnchorString,
        end: { kind: "date" as const, date: "2020-12-31" as AnchorString },
      },
    };
    const { control: reached } = await mountControl({
      journals: { Daily: open },
      placements: [{ journalName: "Daily", anchor: ANCHOR }],
    });
    expect(reached.targets.value).toHaveLength(1);
    const { control: gated } = await mountControl({
      journals: { Daily: closed },
      placements: [{ journalName: "Daily", anchor: ANCHOR }],
    });
    expect(gated.targets.value).toHaveLength(0);
  });

  it("creates directly when a single type is offered", async () => {
    const { harness, control } = await mountControl({
      journals: { Daily: journalWithTypes("Daily", { nt_a: { name: "Meeting" } }) },
      placements: [{ journalName: "Daily", anchor: ANCHOR }],
    });
    const invoke = vi.spyOn(harness.resolve(Flows), "invoke").mockReturnValue(AsyncResult.ok({ path: "x.md" }));
    const pick = vi.spyOn(harness.resolve(WorkspaceService), "pickFromMenu");
    await control.create(new MouseEvent("click", { ctrlKey: true }));
    expect(pick).not.toHaveBeenCalled();
    expect(invoke).toHaveBeenCalledWith(CreateNoteletFlow, {
      journalName: "Daily",
      typeId: "nt_a",
      anchor: ANCHOR,
      openMode: "tab",
    });
  });

  it("asks which type when several are offered, and creates the chosen one", async () => {
    const { harness, control } = await mountControl({
      journals: { Daily: journalWithTypes("Daily", { nt_a: { name: "Meeting" }, nt_b: { name: "Gym" } }) },
      placements: [{ journalName: "Daily", anchor: ANCHOR }],
    });
    const invoke = vi.spyOn(harness.resolve(Flows), "invoke").mockReturnValue(AsyncResult.ok({ path: "x.md" }));
    vi.spyOn(harness.resolve(WorkspaceService), "pickFromMenu").mockReturnValue(AsyncResult.ok("Meeting"));
    await control.create(new MouseEvent("click"));
    expect(invoke).toHaveBeenCalledWith(
      CreateNoteletFlow,
      expect.objectContaining({ typeId: "nt_a", openMode: "active" }),
    );
  });

  it("creates nothing when the menu is dismissed", async () => {
    const { harness, control } = await mountControl({
      journals: { Daily: journalWithTypes("Daily", { nt_a: { name: "Meeting" }, nt_b: { name: "Gym" } }) },
      placements: [{ journalName: "Daily", anchor: ANCHOR }],
    });
    const invoke = vi.spyOn(harness.resolve(Flows), "invoke");
    const { SuggestCancelled } = await import("@/infrastructure/host");
    vi.spyOn(harness.resolve(WorkspaceService), "pickFromMenu").mockReturnValue(
      AsyncResult.err(new SuggestCancelled()),
    );
    await control.create(new MouseEvent("click"));
    expect(invoke).not.toHaveBeenCalled();
  });

  it("qualifies menu labels by journal when the offer spans journals", async () => {
    const { harness, control } = await mountControl({
      journals: {
        Daily: journalWithTypes("Daily", { nt_a: { name: "Meeting" } }),
        Weekly: journalWithTypes("Weekly", { nt_b: { name: "Meeting" } }),
      },
      placements: [
        { journalName: "Daily", anchor: ANCHOR },
        { journalName: "Weekly", anchor: ANCHOR },
      ],
    });
    const pick = vi
      .spyOn(harness.resolve(WorkspaceService), "pickFromMenu")
      .mockReturnValue(AsyncResult.ok("Weekly / Meeting"));
    const invoke = vi.spyOn(harness.resolve(Flows), "invoke").mockReturnValue(AsyncResult.ok({ path: "x.md" }));
    await control.create(new MouseEvent("click"));
    expect(pick).toHaveBeenCalledWith(["Daily / Meeting", "Weekly / Meeting"], expect.anything());
    expect(invoke).toHaveBeenCalledWith(CreateNoteletFlow, expect.objectContaining({ journalName: "Weekly" }));
  });
});
