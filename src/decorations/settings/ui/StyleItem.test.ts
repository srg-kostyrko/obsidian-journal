import { cleanup, render, screen } from "@testing-library/vue";
import { toTypedSchema } from "@vee-validate/valibot";
import * as v from "valibot";
import { useForm } from "vee-validate";
import { afterEach, describe, expect, it } from "vitest";
import { defineComponent, h } from "vue";

import { decorationStyleSchema, type JournalDecorationStyle } from "@/decorations";
import { m } from "@/i18n";
import { Container, provideInjectorOnApp } from "@/infrastructure/di";
import { InputSuggestService } from "@/infrastructure/host";
import { FakeInputSuggestService } from "@/infrastructure/host/input-suggests/testing";

import StyleItem from "./StyleItem.vue";

afterEach(() => cleanup());

const transparent = { type: "transparent" as const };

const blankBorderSide = () => ({ show: false, width: 1, color: transparent, style: "solid" });

function mount(initial: JournalDecorationStyle) {
  const container = new Container();
  container.register(InputSuggestService).useValue(new FakeInputSuggestService() as unknown as InputSuggestService);
  const renderHost = () => h(StyleItem, { name: "s", style: initial });
  const Host = defineComponent({
    setup() {
      useForm({
        initialValues: { s: initial },
        validationSchema: toTypedSchema(v.object({ s: decorationStyleSchema })),
      });
      return renderHost;
    },
  });
  render(Host, {
    global: {
      plugins: [
        {
          install(app) {
            provideInjectorOnApp(app, container);
          },
        },
      ],
    },
  });
}

describe("StyleItem", () => {
  it("renders StyleBackground for a background style", () => {
    mount({ type: "background", color: transparent });
    expect(screen.getByText(m.decoration_style_background_color_label())).toBeTruthy();
  });

  it("renders StyleColor for a color style", () => {
    mount({ type: "color", color: transparent });
    expect(screen.getByText(m.decoration_style_color_label())).toBeTruthy();
  });

  it("renders StyleCorner for a corner style", () => {
    mount({ type: "corner", placement: "top-left", color: transparent });
    expect(screen.getByText(m.decoration_style_corner_placement_label())).toBeTruthy();
  });

  it("renders StyleShape for a shape style", () => {
    mount({
      type: "shape",
      size: 0.4,
      shape: "square",
      color: transparent,
      placement_x: "center",
      placement_y: "middle",
    });
    expect(screen.getByText(m.decoration_style_shape_shape_label())).toBeTruthy();
  });

  it("renders StyleIcon for an icon style", () => {
    mount({
      type: "icon",
      icon: "",
      placement_x: "center",
      placement_y: "middle",
      color: transparent,
      size: 0.5,
    });
    expect(screen.getByText(m.decoration_style_icon_icon_label())).toBeTruthy();
  });

  it("renders StyleBorder for a border style", () => {
    mount({
      type: "border",
      border: "uniform",
      top: blankBorderSide(),
      bottom: blankBorderSide(),
      left: blankBorderSide(),
      right: blankBorderSide(),
    });
    expect(screen.getByText(m.decoration_style_border_mode_label())).toBeTruthy();
  });
});
