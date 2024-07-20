export function epochMsToTimeText(epochMs: number, withoutSeparator?: boolean) {
  if (epochMs === 0) return "";

  const date = new Date(epochMs);
  const year = date.getFullYear().toString().padStart(4, "0");
  const month = (date.getMonth() + 1).toString().padStart(2, "0");
  const dateOfMonth = date.getDate().toString().padStart(2, "0");
  const hour = date.getHours().toString().padStart(2, "0");
  const minute = date.getMinutes().toString().padStart(2, "0");
  const second = date.getSeconds().toString().padStart(2, "0");

  if (withoutSeparator) {
    return `${year}${month}${dateOfMonth} ${hour}${minute}${second}`;
  } else {
    return `${year}-${month}-${dateOfMonth} ${hour}:${minute}:${second}`;
  }
}

// 20230528 123456
export function timeTextToEpochMs(text: string) {
  if (text === "") return 0;

  const now = new Date();
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
        return new Date(year, month - 1, dateOfMonth, hour, minute, second).getTime();
      }
    }
  }

  return Number.NaN;
}

export function durationTextBetweenEpochMs(start: number, end: number) {
  if (start === 0 || end === 0) return "";

  const durationSeconds = Math.floor((end - start) / 1000);

  return `${Math.floor(durationSeconds / 60)
    .toString()
    .padStart(2, "0")}:${(durationSeconds % 60).toString().padStart(2, "0")}`;
}
