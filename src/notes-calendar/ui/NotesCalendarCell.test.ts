import userEvent from "@testing-library/user-event";
import { cleanup, render, screen } from "@testing-library/vue";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { CalendarDate, DayPeriod } from "@/calendar";
import type { Period } from "@/calendar";
import { date, installTestCalendar } from "@/calendar/testing";
import { Container, provideInjectorOnApp } from "@/infrastructure/di";

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

    it("invokes cell.openPreview on mouseenter", async () => {
      const openPreview = vi.fn();
      const { container } = mount({ period: may25, cell: stubApi({ openPreview }) });
      const cell = container.querySelector<HTMLElement>(".notes-calendar-cell")!;
      await userEvent.hover(cell);
      expect(openPreview).toHaveBeenCalled();
      const firstCall = openPreview.mock.calls[0] as [Period, MouseEvent];
      expect(firstCall[0]).toBe(may25);
      expect(firstCall[1]).toBeInstanceOf(MouseEvent);
    });
  });
});
