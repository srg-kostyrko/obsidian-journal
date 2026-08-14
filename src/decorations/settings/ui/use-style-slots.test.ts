import { cleanup, render } from "@testing-library/vue";
import { toTypedSchema } from "@vee-validate/valibot";
import { useForm } from "vee-validate";
import { afterEach, describe, expect, it } from "vitest";
import { defineComponent, h } from "vue";

import { decorationSchema, type JournalDecoration } from "@/decorations";

import { useStyleSlots } from "./use-style-slots";

afterEach(() => cleanup());

const renderHost = () => h("div");

function mount(initial: JournalDecoration) {
  const exposed = {} as {
    values: JournalDecoration;
    slots: ReturnType<typeof useStyleSlots>;
  };
  const Host = defineComponent({
    setup() {
      const form = useForm<JournalDecoration>({
        initialValues: initial,
        validationSchema: toTypedSchema(decorationSchema),
      });
      exposed.values = form.values;
      exposed.slots = useStyleSlots("styles", () => form.values.styles);
      return renderHost;
    },
  });
  render(Host);
  return exposed;
}

const empty: JournalDecoration = { mode: "and", conditions: [], styles: [] };

describe("useStyleSlots", () => {
  it("appends a style when its slot is empty", async () => {
    const host = mount({ ...empty });
    host.slots.add("shape");
    await Promise.resolve();
    expect(host.values.styles.map((s) => s.type)).toEqual(["shape"]);
  });

  it("replaces in place rather than appending when the slot is occupied", async () => {
    const host = mount({ ...empty });
    host.slots.add("shape");
    await Promise.resolve();
    const shape = host.slots.get("shape");
    if (shape === undefined) throw new Error("expected a shape");
    host.slots.put("shape", { ...shape, placement_x: "left" });
    await Promise.resolve();
    expect(host.values.styles).toHaveLength(1);
  });

  it("keeps the position of other styles when one is replaced", async () => {
    const host = mount({ ...empty });
    host.slots.add("background");
    host.slots.add("shape");
    await Promise.resolve();
    const shape = host.slots.get("shape");
    if (shape === undefined) throw new Error("expected a shape");
    host.slots.put("shape", { ...shape, placement_x: "left" });
    await Promise.resolve();
    expect(host.values.styles.map((s) => s.type)).toEqual(["background", "shape"]);
  });

  it("empties a slot on remove", async () => {
    const host = mount({ ...empty });
    host.slots.add("corner");
    await Promise.resolve();
    host.slots.remove("corner");
    await Promise.resolve();
    expect(host.values.styles).toEqual([]);
  });

  it("reports which slots are occupied", async () => {
    const host = mount({ ...empty });
    host.slots.add("icon");
    await Promise.resolve();
    expect(host.slots.occupied.value).toEqual(new Set(["icon"]));
  });
});
