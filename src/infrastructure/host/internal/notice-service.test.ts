import { describe, expect, it, vi } from "vitest";

import { NoticeService } from "./notice-service";

const noticeConstructor = vi.fn();
vi.mock("obsidian", () => ({
  Notice: vi.fn(function (message: string) {
    noticeConstructor(message);
  }),
}));

describe("NoticeService", () => {
  it("shows a notice with the given message", () => {
    noticeConstructor.mockClear();
    new NoticeService().show("Something happened");
    expect(noticeConstructor).toHaveBeenCalledWith("Something happened");
  });
});
