import { Temporal } from "@js-temporal/polyfill";

export function epochMsToPlainDateTime(epochMs: number) {
  return Temporal.Instant.fromEpochMilliseconds(epochMs).toZonedDateTimeISO(Temporal.Now.timeZoneId()).toPlainDateTime();
}

export function epochMsToTimeText(epochMs: number, withoutSeparator?: boolean) {
  if (epochMs === 0) return "";

  const { year, month, day, hour, minute, second } = epochMsToPlainDateTime(epochMs);
  const yearString = year.toString().padStart(4, "0");
  const monthString = month.toString().padStart(2, "0");
  const dayString = day.toString().padStart(2, "0");
  const hourString = hour.toString().padStart(2, "0");
  const minuteString = minute.toString().padStart(2, "0");
  const secondString = second.toString().padStart(2, "0");

  if (withoutSeparator) {
    return `${yearString}${monthString}${dayString} ${hourString}${minuteString}${secondString}`;
  } else {
    return `${yearString}-${monthString}-${dayString} ${hourString}:${minuteString}:${secondString}`;
  }
}

if (import.meta.vitest) {
  describe("epochMsToTimeText", () => {
    test.each([{ timeText: "20230528 225512" }, { timeText: "19700101 000000" }, { timeText: "20240229 235959" }])("$timeText", ({ timeText }) => {
      expect(epochMsToTimeText(timeTextToEpochMs(timeText), true)).toBe(timeText);
    });
  });
}

// 20230528 123456
export function timeTextToEpochMs(text: string) {
  if (text === "") return 0;

  const now = Temporal.Now.zonedDateTimeISO();
  let { year, month, day } = now;
  let second = 0;

  switch (text.length) {
    case 15: {
      year = Number(text.substring(0, 4));
      text = text.substring(4);
    }

    // eslint-disable-next-line no-fallthrough
    case 11: {
      month = Number(text.substring(0, 2));
      text = text.substring(2);
    }

    // eslint-disable-next-line no-fallthrough
    case 9: {
      day = Number(text.substring(0, 2));
      text = text.substring(3);
    }

    // eslint-disable-next-line no-fallthrough
    case 6: {
      second = Number(text.substring(4, 6));
    }

    // eslint-disable-next-line no-fallthrough
    case 4: {
      const hour = Number(text.substring(0, 2));
      const minute = Number(text.substring(2, 4));

      if (
        year >= 0 &&
        year <= 9999 &&
        month >= 1 &&
        month <= 12 &&
        day >= 1 &&
        day <= 31 &&
        hour >= 0 &&
        hour <= 23 &&
        minute >= 0 &&
        minute <= 59 &&
        second >= 0 &&
        second <= 59
      ) {
        return new Temporal.PlainDateTime(year, month, day, hour, minute, second).toZonedDateTime(now.timeZoneId).epochMilliseconds;
      }
    }
  }

  return Number.NaN;
}

if (import.meta.vitest) {
  describe("timeTextToEpochMs", () => {
    test.each([{ epochMs: 1685282112000 }, { epochMs: -32400000 }, { epochMs: 1709218799000 }])("$epochMs", ({ epochMs }) => {
      expect(timeTextToEpochMs(epochMsToTimeText(epochMs, true))).toBe(epochMs);
    });
  });
}
