import userEvent from "@testing-library/user-event";
import { cleanup, render, screen } from "@testing-library/vue";
import { afterEach, describe, expect, it, vi } from "vitest";

import { m } from "@/i18n";
import { Container, provideInjectorOnApp } from "@/infrastructure/di";
import { InputSuggestService } from "@/infrastructure/host";
import { FakeInputSuggestService } from "@/infrastructure/host/input-suggests/testing";

import ToolbarAppearanceRows from "./ToolbarAppearanceRows.vue";

import type { ToolbarItemAppearance } from "../appearance";

function mountRows(
  value: ToolbarItemAppearance,
  appearance: ToolbarItemAppearance,
  onChange: (patch: ToolbarItemAppearance) => void,
) {
  const container = new Container();
  container.register(InputSuggestService).useValue(new FakeInputSuggestService() as unknown as InputSuggestService);
  return render(ToolbarAppearanceRows, {
    props: { value, appearance, onChange },
    global: { plugins: [{ install: (app) => provideInjectorOnApp(app, container) }] },
  });
}

// Inputs render in order: icon, label, tooltip.
const seeded: ToolbarItemAppearance = { icon: "crosshair", tooltip: "Pick a date" };

const iconReset = (): HTMLElement =>
  screen.getByRole("button", { name: m.view_toolbar_appearance_reset({ field: "icon" }) });
const labelReset = (): HTMLElement =>
  screen.getByRole("button", { name: m.view_toolbar_appearance_reset({ field: "label" }) });

afterEach(() => cleanup());

describe("ToolbarAppearanceRows", () => {
  it("shows the stored icon in the icon field", () => {
    mountRows(seeded, seeded, vi.fn());
    const [iconInput] = screen.getAllByRole("textbox");
    expect((iconInput as HTMLInputElement).value).toBe("crosshair");
  });

  it("emits the typed icon", async () => {
    const onChange = vi.fn();
    mountRows(seeded, seeded, onChange);
    const [iconInput] = screen.getAllByRole("textbox");
    await userEvent.clear(iconInput);
    await userEvent.type(iconInput, "star");
    expect(onChange).toHaveBeenLastCalledWith({ icon: "star" });
  });

  it("emits an empty icon when the icon field is emptied", async () => {
    const onChange = vi.fn();
    mountRows(seeded, seeded, onChange);
    const [iconInput] = screen.getAllByRole("textbox");
    await userEvent.clear(iconInput);
    expect(onChange).toHaveBeenLastCalledWith({ icon: "" });
  });

  it("emits the typed label", async () => {
    const onChange = vi.fn();
    mountRows(seeded, seeded, onChange);
    const [, labelInput] = screen.getAllByRole("textbox");
    await userEvent.type(labelInput, "Now");
    expect(onChange).toHaveBeenLastCalledWith({ label: "Now" });
  });

  it("emits the typed tooltip", async () => {
    const onChange = vi.fn();
    mountRows({ icon: "crosshair" }, { icon: "crosshair" }, onChange);
    const [, , tooltipInput] = screen.getAllByRole("textbox");
    await userEvent.type(tooltipInput, "Go");
    expect(onChange).toHaveBeenLastCalledWith({ tooltip: "Go" });
  });

  it("disables the reset control while the value matches the default", () => {
    mountRows(seeded, seeded, vi.fn());
    expect((iconReset() as HTMLButtonElement).disabled).toBe(true);
  });

  it("disables the reset control for a field that is unset and has no default", () => {
    mountRows(seeded, seeded, vi.fn());
    expect((labelReset() as HTMLButtonElement).disabled).toBe(true);
  });

  it("enables the reset control once the value differs from the default", () => {
    mountRows({ ...seeded, icon: "star" }, seeded, vi.fn());
    expect((iconReset() as HTMLButtonElement).disabled).toBe(false);
  });

  it("enables the reset control when the value has been cleared", () => {
    mountRows({ ...seeded, icon: "" }, seeded, vi.fn());
    expect((iconReset() as HTMLButtonElement).disabled).toBe(false);
  });

  it("restores the default when the reset control is pressed", async () => {
    const onChange = vi.fn();
    mountRows({ ...seeded, icon: "star" }, seeded, onChange);
    await userEvent.click(iconReset());
    expect(onChange).toHaveBeenLastCalledWith({ icon: "crosshair" });
  });

  it("restores the current action's default rather than the stored one", async () => {
    const onChange = vi.fn();
    mountRows(
      { icon: "chevron-right", tooltip: "Next month" },
      { icon: "chevron-left", tooltip: "Previous month" },
      onChange,
    );
    await userEvent.click(iconReset());
    expect(onChange).toHaveBeenLastCalledWith({ icon: "chevron-left" });
  });

  it("empties a field whose default is unset when reset is pressed", async () => {
    const onChange = vi.fn();
    mountRows({ ...seeded, label: "Mine" }, seeded, onChange);
    await userEvent.click(labelReset());
    expect(onChange).toHaveBeenLastCalledWith({ label: "" });
  });
});
