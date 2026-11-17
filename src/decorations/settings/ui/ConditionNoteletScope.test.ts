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
import { buildNoteletType, fixedJournal } from "@/journals/testing";
import { testContainer } from "@/testing";

import ConditionNoteletScope from "./ConditionNoteletScope.vue";

type Tag = Extract<JournalDecorationCondition, { type: "tag" }>;

const journal = fixedJournal(
  "Work",
  { type: "day" },
  {
    notelets: {
      meeting: buildNoteletType({ id: "unrelated-a" as TypeId, name: "Meeting" }),
      retro: buildNoteletType({ id: "unrelated-b" as TypeId, name: "Retro" }),
    },
  },
);

const tag = (overrides: Partial<Tag> = {}): Tag => ({
  type: "tag",
  condition: "contains",
  value: "",
  source: "note",
  quantifier: "any",
  typeIds: [],
  ...overrides,
});

async function mount(initial: Tag, journalName?: string) {
  const exposed: { values: { c: Tag } } = { values: { c: initial } };
  const harness = await testContainer({ modules: [journalsCoreModule], data: { journals: { Work: journal } } });
  const renderHost = () => h(ConditionNoteletScope, { name: "c", journalName });
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

describe("ConditionNoteletScope", () => {
  it("always shows the quantifier and source dropdowns", async () => {
    await mount(tag(), "Work");
    expect(screen.getByRole("combobox", { name: m.decoration_condition_scope_quantifier_label() })).toBeTruthy();
    expect(screen.getByRole("combobox", { name: m.decoration_condition_scope_source_label() })).toBeTruthy();
  });

  it("hides the type picker while source is note", async () => {
    await mount(tag(), "Work");
    expect(screen.queryByRole("button", { name: "Meeting" })).toBeNull();
    expect(screen.queryByText(m.decoration_condition_has_notelet_empty())).toBeNull();
  });

  it("shows the journal's notelet types once source includes notelets", async () => {
    await mount(tag({ source: "both" }), "Work");
    expect(screen.getByRole("button", { name: "Meeting" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Retro" })).toBeTruthy();
  });

  it("says so when the journal has no notelet types", async () => {
    await mount(tag({ source: "notelets" }), undefined);
    expect(screen.getByText(m.decoration_condition_has_notelet_empty())).toBeTruthy();
  });

  it("writes quantifier and source into the field", async () => {
    const host = await mount(tag(), "Work");
    await userEvent.selectOptions(
      screen.getByRole("combobox", { name: m.decoration_condition_scope_quantifier_label() }),
      "all",
    );
    await userEvent.selectOptions(
      screen.getByRole("combobox", { name: m.decoration_condition_scope_source_label() }),
      "notelets",
    );
    expect(host.values.c.quantifier).toBe("all");
    expect(host.values.c.source).toBe("notelets");
  });

  it("keeps the picked types when source switches back to note", async () => {
    const host = await mount(tag({ source: "both" }), "Work");
    await userEvent.click(screen.getByRole("button", { name: "Meeting" }));
    await userEvent.selectOptions(
      screen.getByRole("combobox", { name: m.decoration_condition_scope_source_label() }),
      "note",
    );
    expect(host.values.c.typeIds).toEqual(["meeting"]);
  });
});
