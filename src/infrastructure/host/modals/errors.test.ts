import { describe, expect, it } from "vitest";

import { ModalCancelled } from "./errors";

describe("ModalCancelled", () => {
  it("identifies itself with kind 'modal-cancelled'", () => {
    expect(new ModalCancelled().kind).toBe("modal-cancelled");
  });

  it("describes the cancellation in its message", () => {
    expect(new ModalCancelled().message).toBe("Modal was cancelled.");
  });
});
