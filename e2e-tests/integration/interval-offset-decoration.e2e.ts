import { expectDecorated, expectUndecorated, note } from "../journeys/decorations.js";
import { calendar, openSeededCalendarView } from "../journeys/view.js";
import { reloadObsidianOn } from "../support/clock.js";
import { seedNote, writeNote } from "../support/vault.js";

// Real metadataCache events must repaint every offset cell sharing this interval note,
// including when its journal frontmatter has not changed and the index emits no event.
describe("interval offset decorations after metadata indexing", () => {
  const path = "sprint/2026-01-05.md";
  const anchor = "2026-01-05";

  before(async () => {
    await reloadObsidianOn("2026-01-08", {
      vault: "./e2e-tests/fixtures/e2e-interval-offset",
      plugins: ["journals"],
    });
    await seedNote(path, note("sprint", anchor));
    await openSeededCalendarView();
  });

  it("repaints both offset days when the interval note's tag changes", async () => {
    await writeNote(path, note("sprint", anchor, "#ready"));
    await expectDecorated(calendar.cell("2026-01-06"));
    await expectDecorated(calendar.cell("2026-01-18"));
    await expectUndecorated(calendar.cell("2026-01-05"));
    await expectUndecorated(calendar.cell("2026-01-20"));

    await writeNote(path, note("sprint", anchor));
    await expectUndecorated(calendar.cell("2026-01-06"));
    await expectUndecorated(calendar.cell("2026-01-18"));
  });
});
