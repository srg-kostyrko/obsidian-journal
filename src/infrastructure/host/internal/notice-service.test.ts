import { __testing } from "obsidian";
import { beforeEach, describe, expect, it } from "vitest";

import { NoticeService } from "./notice-service";

describe("NoticeService", () => {
  beforeEach(() => {
    __testing.reset();
  });

  it("shows a notice with the given message", () => {
    new NoticeService().show("Something happened");

    expect(__testing.shownNotices).toHaveLength(1);
    expect(__testing.lastShownNotice().message).toBe("Something happened");
  });
});
