import { Timestamp } from "firebase/firestore";
import { describe, it, expect } from "vitest";

import { noneTimestamp, timestampToTimeText, timeTextToTimestamp } from "@/timestamp";

describe("timestamp", () => {
  describe("timestampToTimeText", () => {
    it("returns undefined for noneTimestamp", () => {
      expect(timestampToTimeText(noneTimestamp)).toBeUndefined();
    });

    it("formats timestamp with separator by default", () => {
      const ts = Timestamp.fromDate(new Date(2024, 0, 15, 14, 30, 45));
      expect(timestampToTimeText(ts)).toBe("2024-01-15 14:30:45");
    });

    it("formats timestamp without separator when withSeparator is false", () => {
      const ts = Timestamp.fromDate(new Date(2024, 0, 15, 14, 30, 45));
      expect(timestampToTimeText(ts, false)).toBe("20240115 143045");
    });

    it("pads single digit values with zeros", () => {
      const ts = Timestamp.fromDate(new Date(2024, 0, 5, 4, 3, 2));
      expect(timestampToTimeText(ts)).toBe("2024-01-05 04:03:02");
    });

    it("handles different time zones correctly", () => {
      const ts = Timestamp.fromDate(new Date("2024-12-31T23:59:59"));
      const result = timestampToTimeText(ts);
      expect(result).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
    });
  });

  describe("timeTextToTimestamp", () => {
    it("returns noneTimestamp for empty string", () => {
      expect(timeTextToTimestamp("")).toEqual(noneTimestamp);
    });

    it("parses full format with year (15 characters)", () => {
      const result = timeTextToTimestamp("20240115 143045");
      expect(result).toBeDefined();
      const date = result!.toDate();
      expect(date.getFullYear()).toBe(2024);
      expect(date.getMonth()).toBe(0); // January is 0
      expect(date.getDate()).toBe(15);
      expect(date.getHours()).toBe(14);
      expect(date.getMinutes()).toBe(30);
      expect(date.getSeconds()).toBe(45);
    });

    it("parses format without year (11 characters)", () => {
      const now = new Date();
      const result = timeTextToTimestamp("0115 143045");
      expect(result).toBeDefined();
      const date = result!.toDate();
      expect(date.getFullYear()).toBe(now.getFullYear());
      expect(date.getMonth()).toBe(0);
      expect(date.getDate()).toBe(15);
      expect(date.getHours()).toBe(14);
      expect(date.getMinutes()).toBe(30);
      expect(date.getSeconds()).toBe(45);
    });

    it("parses format without year and month (9 characters)", () => {
      const now = new Date();
      const result = timeTextToTimestamp("15 143045");
      expect(result).toBeDefined();
      const date = result!.toDate();
      expect(date.getFullYear()).toBe(now.getFullYear());
      expect(date.getMonth()).toBe(now.getMonth());
      expect(date.getDate()).toBe(15);
      expect(date.getHours()).toBe(14);
      expect(date.getMinutes()).toBe(30);
      expect(date.getSeconds()).toBe(45);
    });

    it("parses format with hours and minutes and seconds (6 characters)", () => {
      const now = new Date();
      const result = timeTextToTimestamp("143045");
      expect(result).toBeDefined();
      const date = result!.toDate();
      expect(date.getFullYear()).toBe(now.getFullYear());
      expect(date.getMonth()).toBe(now.getMonth());
      expect(date.getDate()).toBe(now.getDate());
      expect(date.getHours()).toBe(14);
      expect(date.getMinutes()).toBe(30);
      expect(date.getSeconds()).toBe(45);
    });

    it("parses format with only hours and minutes (4 characters)", () => {
      const now = new Date();
      const result = timeTextToTimestamp("1430");
      expect(result).toBeDefined();
      const date = result!.toDate();
      expect(date.getFullYear()).toBe(now.getFullYear());
      expect(date.getMonth()).toBe(now.getMonth());
      expect(date.getDate()).toBe(now.getDate());
      expect(date.getHours()).toBe(14);
      expect(date.getMinutes()).toBe(30);
      expect(date.getSeconds()).toBe(0);
    });

    it("returns undefined for invalid format", () => {
      expect(timeTextToTimestamp("invalid")).toBeUndefined();
      expect(timeTextToTimestamp("12")).toBeUndefined();
      expect(timeTextToTimestamp("123")).toBeUndefined();
      expect(timeTextToTimestamp("12345")).toBeUndefined();
    });

    it("returns undefined for out of range values", () => {
      expect(timeTextToTimestamp("2524")).toBeUndefined(); // hour 25 is invalid
      expect(timeTextToTimestamp("1460")).toBeUndefined(); // minute 60 is invalid
      expect(timeTextToTimestamp("145060")).toBeUndefined(); // second 60 is invalid
      expect(timeTextToTimestamp("1315 000000")).toBeUndefined(); // month 13 is invalid
      expect(timeTextToTimestamp("32 000000")).toBeUndefined(); // date 32 is invalid
      expect(timeTextToTimestamp("00 0000")).toBeUndefined(); // date 0 is invalid
      expect(timeTextToTimestamp("0231 000000")).toBeUndefined(); // Feb 31 is invalid
    });

    it("handles edge cases correctly", () => {
      expect(timeTextToTimestamp("0000")).toBeDefined(); // 00:00 is valid
      expect(timeTextToTimestamp("2359")).toBeDefined(); // 23:59 is valid
      expect(timeTextToTimestamp("235959")).toBeDefined(); // 23:59:59 is valid
      expect(timeTextToTimestamp("01 000000")).toBeDefined(); // date 1 is valid
      expect(timeTextToTimestamp("15 000000")).toBeDefined(); // date 15 is valid
      expect(timeTextToTimestamp("0101 000000")).toBeDefined(); // month 1 is valid
      expect(timeTextToTimestamp("1231 000000")).toBeDefined(); // month 12 is valid
      expect(timeTextToTimestamp("0131 000000")).toBeDefined(); // Jan 31 is valid
    });

    it("roundtrip conversion works correctly", () => {
      const originalTs = Timestamp.fromDate(new Date(2024, 0, 15, 14, 30, 45));
      const timeText = timestampToTimeText(originalTs, false);
      const parsedTs = timeTextToTimestamp(timeText!);
      expect(parsedTs).toBeDefined();
      expect(parsedTs!.toDate()).toEqual(originalTs.toDate());
    });
  });
});
