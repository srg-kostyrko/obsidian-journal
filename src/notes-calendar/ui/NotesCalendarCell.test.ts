import userEvent from "@testing-library/user-event";
import { cleanup, render, screen } from "@testing-library/vue";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { CalendarDate, DayPeriod } from "@/calendar";
import type { Period } from "@/calendar";
import { date, installTestCalendar } from "@/calendar/testing";
import { Container, provideInjectorOnApp } from "@/infrastructure/di";
import { defineOpenMode } from "@/infrastructure/host";

import NotesCalendarCell from "./NotesCalendarCell.vue";

import type { NotesCellApi } from "../use-notes-cell";

function stubApi(overrides: Partial<NotesCellApi> = {}): NotesCellApi {
  return {
    open: vi.fn(),
    openContextMenu: vi.fn(),
    openPreview: vi.fn(),
    isActive: () => false,
    isActionable: () => true,
    ...overrides,
  };
}

function mount(props: { period: Period; cell: NotesCellApi; format?: string }) {
  const c = new Container();
  return render(NotesCalendarCell, {
    props,
    global: {
      plugins: [
        {
          install(app) {
            provideInjectorOnApp(app, c);
          },
        },
      ],
    },
  });
}

const may25 = DayPeriod.containing(date("2026-05-25"));

describe("NotesCalendarCell", () => {
  let teardown: () => void;
  beforeEach(() => {
    ({ teardown } = installTestCalendar());
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    teardown();
    cleanup();
  });

  describe("label", () => {
    it("renders the period formatted with the default pattern when format prop is absent", () => {
      mount({ period: may25, cell: stubApi() });
      expect(screen.getByText("25")).toBeTruthy();
    });

    it("respects an explicit format prop", () => {
      mount({ period: may25, cell: stubApi(), format: "YYYY-MM-DD" });
      expect(screen.getByText("2026-05-25")).toBeTruthy();
    });
  });

  describe("accessible name", () => {
    it("names the full date, not the bare number the cell renders", () => {
      // The visible label of a day cell is "25", so a screen reader announced "25, button" —
      // no month, no year. The label pattern comes from moment, not a duplicated catalog.
      const { container } = mount({ period: may25, cell: stubApi() });
      const cell = container.querySelector<HTMLElement>(".notes-calendar-cell");
      expect(cell?.getAttribute("aria-label")).toBe(may25.format("LL"));
    });

    it("leaves a non-actionable cell unnamed, since it is not a control", () => {
      const { container } = mount({ period: may25, cell: stubApi({ isActionable: () => false }) });
      const cell = container.querySelector<HTMLElement>(".notes-calendar-cell");
      expect(cell?.hasAttribute("aria-label")).toBe(false);
    });
  });

  describe("middle click", () => {
    it("opens the period, as every other note-opening affordance does", async () => {
      const api = stubApi();
      const { container } = mount({ period: may25, cell: api });
      const cell = container.querySelector<HTMLElement>(".notes-calendar-cell")!;
      await userEvent.pointer({ target: cell, keys: "[MouseMiddle]" });
      expect(api.open).toHaveBeenCalled();
    });

    it("passes the middle-click event through, so it resolves to a new tab", async () => {
      const api = stubApi();
      const { container } = mount({ period: may25, cell: api });
      const cell = container.querySelector<HTMLElement>(".notes-calendar-cell")!;
      await userEvent.pointer({ target: cell, keys: "[MouseMiddle]" });
      const event = vi.mocked(api.open).mock.calls.at(-1)?.[1] as MouseEvent;
      expect(defineOpenMode(event)).toBe("tab");
    });
  });

  describe("keyboard access", () => {
    it("is focusable when actionable", () => {
      const { container } = mount({ period: may25, cell: stubApi() });
      const cell = container.querySelector<HTMLElement>(".notes-calendar-cell");
      expect(cell?.tabIndex).toBe(0);
    });

    it("is not focusable when not actionable", () => {
      const { container } = mount({ period: may25, cell: stubApi({ isActionable: () => false }) });
      const cell = container.querySelector<HTMLElement>(".notes-calendar-cell");
      expect(cell?.hasAttribute("tabindex")).toBe(false);
    });
  });

  describe("data attributes", () => {
    it("renders data-active when the cell reports active", () => {
      const { container } = mount({
        period: may25,
        cell: stubApi({ isActive: () => true }),
      });
      const cell = container.querySelector<HTMLElement>(".notes-calendar-cell");
      expect(cell?.dataset.active).toBe("true");
    });

    it("omits data-active when the cell reports inactive", () => {
      const { container } = mount({ period: may25, cell: stubApi() });
      const cell = container.querySelector<HTMLElement>(".notes-calendar-cell");
      expect(cell?.dataset.active).toBeUndefined();
    });

    it("renders data-inactive when the cell reports not actionable", () => {
      const { container } = mount({
        period: may25,
        cell: stubApi({ isActionable: () => false }),
      });
      const cell = container.querySelector<HTMLElement>(".notes-calendar-cell");
      expect(cell?.dataset.inactive).toBe("true");
    });

    it("renders data-anchor with the period's anchor", () => {
      const { container } = mount({ period: may25, cell: stubApi() });
      const cell = container.querySelector<HTMLElement>(".notes-calendar-cell");
      expect(cell?.dataset.anchor).toBe("2026-05-25");
    });
  });

  describe("today marker", () => {
    it("renders data-today when the cell's period contains today", () => {
      vi.spyOn(CalendarDate, "today").mockReturnValue(date("2026-05-25"));
      const { container } = mount({ period: may25, cell: stubApi() });
      const cell = container.querySelector<HTMLElement>(".notes-calendar-cell");
      expect(cell?.dataset.today).toBe("true");
    });

    it("omits data-today when the cell's period does not contain today", () => {
      vi.spyOn(CalendarDate, "today").mockReturnValue(date("2026-01-01"));
      const { container } = mount({ period: may25, cell: stubApi() });
      const cell = container.querySelector<HTMLElement>(".notes-calendar-cell");
      expect(cell?.dataset.today).toBeUndefined();
    });

    it("drops the marker when the local date rolls over while the cell stays mounted", async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date(2026, 4, 25, 23, 59, 0));
      const { container } = mount({ period: may25, cell: stubApi() });
      const cell = container.querySelector<HTMLElement>(".notes-calendar-cell");
      expect(cell?.dataset.today).toBe("true");

      await vi.advanceTimersByTimeAsync(61_000);

      expect(cell?.dataset.today).toBeUndefined();
    });

    it("takes the marker when the local date rolls over onto the cell's period", async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date(2026, 4, 24, 23, 59, 0));
      const { container } = mount({ period: may25, cell: stubApi() });
      const cell = container.querySelector<HTMLElement>(".notes-calendar-cell");
      expect(cell?.dataset.today).toBeUndefined();

      await vi.advanceTimersByTimeAsync(61_000);

      expect(cell?.dataset.today).toBe("true");
    });
  });

  describe("event handlers", () => {
    it("invokes cell.open on click", async () => {
      const open = vi.fn();
      const { container } = mount({ period: may25, cell: stubApi({ open }) });
      const cell = container.querySelector<HTMLElement>(".notes-calendar-cell")!;
      await userEvent.click(cell);
      expect(open).toHaveBeenCalled();
      const firstCall = open.mock.calls[0] as [Period, MouseEvent];
      expect(firstCall[0]).toBe(may25);
      expect(firstCall[1]).toBeInstanceOf(MouseEvent);
    });

    it("invokes cell.openContextMenu and prevents the browser default on contextmenu", () => {
      const openContextMenu = vi.fn();
      const { container } = mount({ period: may25, cell: stubApi({ openContextMenu }) });
      const cell = container.querySelector<HTMLElement>(".notes-calendar-cell")!;
      const event = new MouseEvent("contextmenu", { bubbles: true, cancelable: true });
      cell.dispatchEvent(event);
      expect(openContextMenu).toHaveBeenCalledWith(may25, event);
      expect(event.defaultPrevented).toBe(true);
    });

    it("invokes cell.open on Enter when focused", async () => {
      const open = vi.fn();
      const { container } = mount({ period: may25, cell: stubApi({ open }) });
      const cell = container.querySelector<HTMLElement>(".notes-calendar-cell")!;
      cell.focus();
      await userEvent.keyboard("{Enter}");
      expect(open).toHaveBeenCalled();
      const firstCall = open.mock.calls[0] as [Period, KeyboardEvent];
      expect(firstCall[0]).toBe(may25);
    });
  });

  describe("hover preview", () => {
    it("previews when the modifier is already held on enter", () => {
      const openPreview = vi.fn();
      const { container } = mount({ period: may25, cell: stubApi({ openPreview }) });
      const cell = container.querySelector<HTMLElement>(".notes-calendar-cell")!;
      cell.dispatchEvent(new MouseEvent("mouseenter", { ctrlKey: true }));
      expect(openPreview).toHaveBeenCalledTimes(1);
      const firstCall = openPreview.mock.calls[0] as [Period, MouseEvent];
      expect(firstCall[0]).toBe(may25);
    });

    it("previews when the modifier is pressed while hovering", () => {
      const openPreview = vi.fn();
      const { container } = mount({ period: may25, cell: stubApi({ openPreview }) });
      const cell = container.querySelector<HTMLElement>(".notes-calendar-cell")!;
      cell.dispatchEvent(new MouseEvent("mouseenter"));
      expect(openPreview).not.toHaveBeenCalled();
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "Control" }));
      expect(openPreview).toHaveBeenCalledTimes(1);
    });

    it("does not preview for a modifier pressed after the pointer left", () => {
      const openPreview = vi.fn();
      const { container } = mount({ period: may25, cell: stubApi({ openPreview }) });
      const cell = container.querySelector<HTMLElement>(".notes-calendar-cell")!;
      cell.dispatchEvent(new MouseEvent("mouseenter"));
      cell.dispatchEvent(new MouseEvent("mouseleave"));
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "Control" }));
      expect(openPreview).not.toHaveBeenCalled();
    });
  });
});
