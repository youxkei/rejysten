import { expect, test, describe } from "vitest";

import { epochMsToTimeText, timeTextToEpochMs } from "@/temporal";

describe.concurrent("temporal", () => {
  describe("epochMsToTimeText", () => {
    test.each([{ timeText: "20230528 225512" }, { timeText: "19700101 000000" }, { timeText: "20240229 235959" }])(
      "$timeText",
      ({ timeText }) => {
        expect(epochMsToTimeText(timeTextToEpochMs(timeText), true)).toBe(timeText);
      },
    );
  });

  describe("timeTextToEpochMs", () => {
    test.each([{ epochMs: 1685282112000 }, { epochMs: 1709218799000 }])("$epochMs", ({ epochMs }) => {
      expect(timeTextToEpochMs(epochMsToTimeText(epochMs, true))).toBe(epochMs);
    });
  });
});
