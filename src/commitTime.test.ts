import { describe, expect, it } from "vitest";

import { formatCommitTime } from "@/commitTime";

describe("formatCommitTime", () => {
  it("formats an ISO timestamp in the viewer's local time", () => {
    // Built from local-time fields so the expectation holds in any timezone
    const date = new Date(2026, 5, 7, 17, 20, 44);
    expect(formatCommitTime(date.toISOString())).toBe("2026-06-07 17:20");
  });

  it("zero-pads months, days, hours, and minutes", () => {
    const date = new Date(2026, 0, 2, 3, 4, 5);
    expect(formatCommitTime(date.toISOString())).toBe("2026-01-02 03:04");
  });

  it("returns an empty string for an empty input", () => {
    expect(formatCommitTime("")).toBe("");
  });

  it("returns an empty string for an unparsable input", () => {
    expect(formatCommitTime("not-a-date")).toBe("");
  });
});
