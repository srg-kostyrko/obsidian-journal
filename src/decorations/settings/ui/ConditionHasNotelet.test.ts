import userEvent from "@testing-library/user-event";
import { screen } from "@testing-library/vue";
import { toTypedSchema } from "@vee-validate/valibot";
import * as v from "valibot";
import { useForm } from "vee-validate";
import { describe, expect, it } from "vitest";
import { defineComponent, h } from "vue";

import { decorationConditionSchema, type JournalDecorationCondition } from "@/decorations";
import { m } from "@/i18n";
import type { TypeId } from "@/journals";
import { journalsCoreModule } from "@/journals/module";
import { fixedJournal, buildNoteletType } from "@/journals/testing";
import { testContainer } from "@/testing";

import ConditionHasNotelet from "./ConditionHasNotelet.vue";

type HasNotelet = Extract<JournalDecorationCondition, { type: "has-notelet" }>;

const journalWithTwoTypes = fixedJournal(
  "Work",
  { type: "day" },
  {
    notelets: {
      meeting: buildNoteletType({ id: "unrelated-a" as TypeId, name: "Meeting" }),
      "1o1": buildNoteletType({ id: "unrelated-b" as TypeId, name: "1o1" }),
    },
  },
);

async function mount(initial: HasNotelet, journalName?: string) {
  const exposed: { values: { c: HasNotelet } } = { values: { c: initial } };
  const harness = await testContainer({
    modules: [journalsCoreModule],
    data: { journals: { Work: journalWithTwoTypes } },
  });
  const renderHost = () => h(ConditionHasNotelet, { name: "c", journalName });
  const Host = defineComponent({
    setup() {
      const form = useForm({
        initialValues: { c: initial },
        validationSchema: toTypedSchema(v.object({ c: decorationConditionSchema })),
      });
      exposed.values = form.values as typeof exposed.values;
      return renderHost;
    },
  });
  harness.render(Host);
  return exposed;
}

describe("ConditionHasNotelet", () => {
  it("offers the journal's notelet types as options", async () => {
    await mount({ type: "has-notelet", typeIds: [] }, "Work");
    expect(screen.getByRole("button", { name: "Meeting" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "1o1" })).toBeTruthy();
  });

  it("renders no options for a journal with no notelet types", async () => {
    await mount({ type: "has-notelet", typeIds: [] }, undefined);
    expect(screen.getByText(m.decoration_condition_has_notelet_empty())).toBeTruthy();
    expect(screen.queryByRole("group")).toBeFalsy();
  });

  it("writes the selected ids into the field", async () => {
    const host = await mount({ type: "has-notelet", typeIds: [] }, "Work");
    await userEvent.click(screen.getByRole("button", { name: "Meeting" }));
    expect(host.values.c.typeIds).toEqual(["meeting"]);
  });

  it("reflects ids already stored in the field", async () => {
    await mount({ type: "has-notelet", typeIds: ["1o1"] }, "Work");
    expect(screen.getByRole("button", { name: "1o1" }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByRole("button", { name: "Meeting" }).getAttribute("aria-pressed")).toBe("false");
  });
});
