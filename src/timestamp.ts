import { Timestamp } from "firebase/firestore";

import { NewDate } from "@/date";

export const noneTimestamp = Timestamp.fromDate(new Date("3000-12-31T23:59:59Z"));

export const hourMs = 60 * 60 * 1000;
export const dayMs = 24 * hourMs;

export function timestampToTimeText(ts: Timestamp, withSeparator = true) {
  if (ts.isEqual(noneTimestamp)) return undefined;

  const date = ts.toDate();

  const year = date.getFullYear().toString().padStart(4, "0");
  const month = (date.getMonth() + 1).toString().padStart(2, "0");
  const dateOfMonth = date.getDate().toString().padStart(2, "0");
  const hour = date.getHours().toString().padStart(2, "0");
  const minute = date.getMinutes().toString().padStart(2, "0");
  const second = date.getSeconds().toString().padStart(2, "0");

  if (withSeparator) {
    return `${year}-${month}-${dateOfMonth} ${hour}:${minute}:${second}`;
  } else {
    return `${year}${month}${dateOfMonth} ${hour}${minute}${second}`;
  }
}

export function timeTextToTimestamp(text: string) {
  if (text === "") return noneTimestamp;

  const now = NewDate();
  let year = now.getFullYear();
  let month = now.getMonth() + 1;
  let dateOfMonth = now.getDate();
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
      dateOfMonth = Number(text.substring(0, 2));
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
        dateOfMonth >= 1 &&
        dateOfMonth <= 31 &&
        hour >= 0 &&
        hour <= 23 &&
        minute >= 0 &&
        minute <= 59 &&
        second >= 0 &&
        second <= 59
      ) {
        const date = new Date(year, month - 1, dateOfMonth, hour, minute, second);
        // Verify the date components match to avoid rollover (e.g., month 13 -> next year)
        if (date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === dateOfMonth) {
          return Timestamp.fromDate(date);
        }
      }
    }
  }

  return;
}
