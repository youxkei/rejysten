import { describe, it, expect } from "vitest";

import { nextBatchVersionWrite } from "@/writeContract/batchVersion";

describe("nextBatchVersionWrite", () => {
  it("creates the first version unconditionally with an empty prevVersion", () => {
    expect(nextBatchVersionWrite(undefined, "uuid-1")).toEqual({
      op: "set",
      data: { prevVersion: "", version: "uuid-1" },
    });
  });

  it("treats an empty current version as absent (create, not CAS update)", () => {
    expect(nextBatchVersionWrite("", "uuid-1")).toEqual({
      op: "set",
      data: { prevVersion: "", version: "uuid-1" },
    });
  });

  it("chains from an existing version with a CAS update carrying it as prevVersion", () => {
    expect(nextBatchVersionWrite("uuid-prev", "uuid-next")).toEqual({
      op: "update",
      data: { prevVersion: "uuid-prev", version: "uuid-next" },
    });
  });
});
