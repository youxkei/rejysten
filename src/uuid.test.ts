import { uuidv7 } from "uuidv7";
import { describe, it, expect } from "vitest";

import { uuidV7ToMs } from "@/uuid";

describe("uuidV7ToMs", () => {
  it("recovers the generation time embedded in a uuidv7", () => {
    const before = Date.now();
    const id = uuidv7();
    const after = Date.now();

    const ms = uuidV7ToMs(id);
    expect(ms).toBeGreaterThanOrEqual(before);
    expect(ms).toBeLessThanOrEqual(after);
  });

  it("decodes the 48-bit big-endian timestamp prefix", () => {
    // First 12 hex digits (0x0000_1234_5678) are the millisecond timestamp.
    expect(uuidV7ToMs("00001234-5678-7000-8000-000000000000")).toBe(0x12345678);
  });

  it("reads the prefix even when a suffix is appended (e.g. an ngram doc id)", () => {
    const id = uuidv7();
    expect(uuidV7ToMs(`${id}lifeLogs`)).toBe(uuidV7ToMs(id));
  });

  it("returns NaN for a non-uuid string", () => {
    expect(uuidV7ToMs("$completion0lifeLogs")).toBeNaN();
  });
});
