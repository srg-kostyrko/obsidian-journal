import { render } from "@testing-library/vue";
import { afterEach, describe, expect, it } from "vitest";
import { defineComponent, h, nextTick, ref, type ComputedRef } from "vue";

import type { AnchorString } from "@/calendar";
import { Container, provideInjectorOnApp } from "@/infrastructure/di";

import { ActiveEntryViewModel, type ActiveEntryRef } from "./active-entry";
import { FakeActiveEntryViewModel } from "./testing";
import { useFollowActiveDate, type FollowActiveDateOptions } from "./use-follow-active-date";

function renderDiv() {
  return h("div");
}

function mount(
  options: FollowActiveDateOptions,
  initialActive: ActiveEntryRef | null = null,
): { focus: ComputedRef<AnchorString>; active: FakeActiveEntryViewModel; unmount: () => void } {
  const container = new Container();
  const active = new FakeActiveEntryViewModel();
  active.setActive(initialActive);
  container.register(ActiveEntryViewModel).useValue(active as unknown as ActiveEntryViewModel);

  let captured: ComputedRef<AnchorString> | null = null;
  const Host = defineComponent({
    setup() {
      captured = useFollowActiveDate(options);
      return renderDiv;
    },
  });
  const utilities = render(Host, {
    global: { plugins: [{ install: (app) => provideInjectorOnApp(app, container) }] },
  });
  if (!captured) throw new Error("focus not captured");
  return { focus: captured, active, unmount: () => utilities.unmount() };
}

const A = "2026-05-15" as AnchorString;
const B = "2026-09-10" as AnchorString;
const daily = (anchor: AnchorString): ActiveEntryRef => ({ journalName: "daily", anchor });

afterEach(() => {
  // @testing-library/vue auto-cleanup runs per test; nothing extra needed.
});

describe("useFollowActiveDate", () => {
  it("recenters focus to an in-scope note that is off-window", async () => {
    const { focus, active } = mount({
      refDate: ref(A),
      enabled: () => true,
      inScope: () => true,
      isVisible: () => false,
    });
    active.setActive(daily(B));
    await nextTick();
    expect(focus.value).toBe(B);
  });

  it("keeps focus on the reference date for an in-scope note already visible", async () => {
    const { focus, active } = mount({
      refDate: ref(A),
      enabled: () => true,
      inScope: () => true,
      isVisible: () => true,
    });
    active.setActive(daily(B));
    await nextTick();
    expect(focus.value).toBe(A);
  });

  it("returns focus to the reference date for an out-of-scope note", async () => {
    const { focus, active } = mount({
      refDate: ref(A),
      enabled: () => true,
      inScope: (name) => name === "daily",
      isVisible: () => false,
    });
    active.setActive(daily(B));
    await nextTick();
    expect(focus.value).toBe(B);
    active.setActive({ journalName: "weekly", anchor: "2026-10-01" as AnchorString });
    await nextTick();
    expect(focus.value).toBe(A);
  });

  it("returns focus to the reference date when the active note clears", async () => {
    const { focus, active } = mount({
      refDate: ref(A),
      enabled: () => true,
      inScope: () => true,
      isVisible: () => false,
    });
    active.setActive(daily(B));
    await nextTick();
    active.setActive(null);
    await nextTick();
    expect(focus.value).toBe(A);
  });

  it("does not follow while disabled", async () => {
    const { focus, active } = mount({
      refDate: ref(A),
      enabled: () => false,
      inScope: () => true,
      isVisible: () => false,
    });
    active.setActive(daily(B));
    await nextTick();
    expect(focus.value).toBe(A);
  });

  it("returns focus to the reference date when the reference date changes", async () => {
    const refDate = ref(A);
    const { focus, active } = mount({
      refDate,
      enabled: () => true,
      inScope: () => true,
      isVisible: () => false,
    });
    active.setActive(daily(B));
    await nextTick();
    refDate.value = "2026-12-01" as AnchorString;
    await nextTick();
    expect(focus.value).toBe("2026-12-01");
  });

  it("follows a note that is already active at mount", () => {
    const { focus } = mount(
      { refDate: ref(A), enabled: () => true, inScope: () => true, isVisible: () => false },
      daily(B),
    );
    expect(focus.value).toBe(B);
  });
});
