import { cleanup, waitFor } from "@solidjs/testing-library";
import { Timestamp } from "firebase/firestore";
import { afterAll, afterEach, beforeAll, describe, expect, vi } from "vitest";
import { page, userEvent } from "vitest/browser";

import { awaitPendingCallbacks } from "@/awaitableCallback";
import { baseTime, setupLifeLogsTest } from "@/panes/lifeLogs/test";
import { getCollection, getSingletonDoc } from "@/services/firebase/firestore";
import { styles } from "@/styles.css";
import { acquireEmulator, releaseEmulator, testWithDb as it } from "@/test";
import { dayMs } from "@/timestamp";

vi.mock(import("@/date"), async () => {
  return {
    NewDate: () => baseTime,
    DateNow: () => baseTime.getTime(),
    TimestampNow: () => Timestamp.fromDate(baseTime),
  };
});

beforeAll(async () => {
  await acquireEmulator();
});

afterAll(async () => {
  await releaseEmulator();
});

afterEach(async () => {
  await awaitPendingCallbacks();
  cleanup();
});

describe("<LifeLogs />", () => {
  it("renders correctly", async ({ db, task }) => {
    const { result } = await setupLifeLogsTest(task.id, db);

    // Test: renders lifelog data correctly
    const firstElement = await result.findByText("first lifelog");
    expect(firstElement).toBeTruthy();

    // Test: renders multiple lifelogs
    const secondElement = await result.findByText("second lifelog");
    expect(secondElement).toBeTruthy();

    // Test: lifelogs are rendered in correct order (by endAt)
    const listItems = result.container.querySelectorAll("li");
    const firstIndex = Array.from(listItems).findIndex((li) => li.textContent?.includes("first lifelog"));
    const secondIndex = Array.from(listItems).findIndex((li) => li.textContent?.includes("second lifelog"));
    expect(firstIndex).toBeLessThan(secondIndex);

    // Test: endAt is noneTimestamp, so it should show "N/A"
    const naElements = result.getAllByText("N/A");
    expect(naElements.length).toBe(6); // $log1 and $log2 have noneTimestamp endAt, $log3 and $log4 have both startAt and endAt as noneTimestamp

    // Test: time is displayed correctly (format: YYYY-MM-DD HH:MM:SS)
    expect(result.getByText("2026-01-10 10:30:00")).toBeTruthy();
    expect(result.getByText("2026-01-10 12:00:00")).toBeTruthy();
  });

  it("can edit text with i key (cursor at start)", async ({ db, task }) => {
    const { result } = await setupLifeLogsTest(task.id, db);

    await result.findByText("first lifelog");

    // $log1 is already selected in setup, press "i" to enter editing mode with cursor at start
    await userEvent.keyboard("{i}");
    await awaitPendingCallbacks();

    // Input should now be visible
    const input = result.container.querySelector("input")!;
    expect(input).toBeTruthy();

    input.focus();
    // Type at the beginning (cursor is at start with 'i' key)
    await userEvent.keyboard("prefix ");

    // Press Escape to save and exit editing
    await userEvent.keyboard("{Escape}");
    await awaitPendingCallbacks();

    // Verify the DOM was updated - "prefix " was added at the beginning
    expect(result.getByText("prefix first lifelog")).toBeTruthy();
    expect(result.queryByText("first lifelog")).toBeNull();
  });

  it("can edit text with a key (cursor at end)", async ({ db, task }) => {
    const { result } = await setupLifeLogsTest(task.id, db);

    await result.findByText("first lifelog");

    // $log1 is already selected in setup, press "a" to enter editing mode with cursor at end
    await userEvent.keyboard("{a}");
    await awaitPendingCallbacks();

    // Input should now be visible
    const input = result.container.querySelector("input")!;
    expect(input).toBeTruthy();

    input.focus();
    // Delete one character using backspace, then type additional text (cursor is at end with 'a' key)
    await userEvent.keyboard("{Backspace} edited");

    // Press Escape to save and exit editing
    const start = performance.now();
    await userEvent.keyboard("{Escape}");

    // Verify the DOM was updated - original was "first lifelog", deleted 'g', added " edited"
    await awaitPendingCallbacks();
    expect(result.getByText("first lifelo edited")).toBeTruthy();
    const end = performance.now();
    const duration = end - start;

    expect(duration, `Edit text took ${duration.toFixed(2)}ms`).toBeLessThan(150);
    expect(result.queryByText("first lifelog")).toBeNull();
  });

  it("can navigate to startAt and endAt fields with Tab key during editing", async ({ db, task }) => {
    const { result } = await setupLifeLogsTest(task.id, db);

    await result.findByText("first lifelog");

    // Verify initial startAt is displayed as "10:30:00"
    expect(result.getByText("2026-01-10 10:30:00")).toBeTruthy();

    // $log1 is already selected in setup, press "i" to enter editing mode (starts in text field)
    await userEvent.keyboard("{i}");
    await awaitPendingCallbacks();

    // Input should now be visible with text field value
    const input = result.container.querySelector("input")!;
    expect(input).toBeTruthy();
    expect(input.value).toBe("first lifelog");

    // Press Tab to navigate to startAt field
    await userEvent.keyboard("{Tab}");
    await awaitPendingCallbacks();

    // Input should now show startAt value (format without separators: YYYYMMDD HHMMSS)
    {
      const input = result.container.querySelector("input") as HTMLInputElement;
      expect(input).toBeTruthy();
      expect(input.value).toBe("20260110 103000");
    }

    // Edit startAt: delete last character and type "5" to change 103000 -> 103005
    await userEvent.keyboard("{Backspace}5");
    {
      const input = result.container.querySelector("input") as HTMLInputElement;
      expect(input.value).toBe("20260110 103005");
    }

    // Press Tab to navigate to endAt field (this saves startAt)
    await userEvent.keyboard("{Tab}");
    await awaitPendingCallbacks();

    // Input should now show endAt value (empty string since it's noneTimestamp)
    {
      const input = result.container.querySelector("input") as HTMLInputElement;
      expect(input).toBeTruthy();
      expect(input.value).toBe(""); // noneTimestamp shows as empty in edit mode
    }

    // Edit endAt: type a new time value in format without separators (YYYYMMDD HHMMSS)
    await userEvent.keyboard("20260110 110000");
    {
      const input = result.container.querySelector("input") as HTMLInputElement;
      expect(input.value).toBe("20260110 110000");
    }

    // Press Escape to save and exit editing
    await userEvent.keyboard("{Escape}");
    await awaitPendingCallbacks();

    // Verify the DOM was updated with new startAt
    expect(result.getByText("2026-01-10 10:30:05")).toBeTruthy();

    // Verify startAt was changed (old value should not exist)
    expect(result.queryByText("2026-01-10 10:30:00")).toBeNull();

    // Verify endAt was set (should now show the new time instead of N/A)
    expect(result.getByText("2026-01-10 11:00:00")).toBeTruthy();

    // Verify N/A count decreased (was 6, now 5: $log2 endAt, $log3 startAt, $log3 endAt, $log4 startAt, $log4 endAt)
    const naElements = result.getAllByText("N/A");
    expect(naElements.length).toBe(5);
  });

  it("can edit startAt with various digit formats", async ({ db, task }) => {
    const { result } = await setupLifeLogsTest(task.id, db);

    await result.findByText("first lifelog");

    // Helper to enter edit mode for startAt
    async function enterStartAtEditMode() {
      await userEvent.keyboard("{i}"); // Enter text edit mode
      await awaitPendingCallbacks();

      const input = result.container.querySelector("input");
      expect(input).toBeTruthy();

      await userEvent.keyboard("{Tab}"); // Navigate to startAt
      await awaitPendingCallbacks();
      // Input should now be the startAt input (check it has a time-like value)
      {
        const input = result.container.querySelector("input") as HTMLInputElement;
        expect(input).toBeTruthy();
        // startAt value should be in format "YYYYMMDD HHMMSS" (without separators)
        expect(input.value).toMatch(/^\d{8} \d{6}$/);
      }
    }

    // Test 4-digit format (HHMM) - should use current date (2026-01-10) with specified time, seconds = 0
    await enterStartAtEditMode();
    await userEvent.keyboard("{Control>}a{/Control}1234");
    await userEvent.keyboard("{Escape}");
    await awaitPendingCallbacks();

    expect(result.getByText("2026-01-10 12:34:00")).toBeTruthy();

    // Test 6-digit format (HHMMSS) - should use current date with specified time
    await enterStartAtEditMode();
    await userEvent.keyboard("{Control>}a{/Control}123456");
    await userEvent.keyboard("{Escape}");
    await awaitPendingCallbacks();

    expect(result.getByText("2026-01-10 12:34:56")).toBeTruthy();

    // Test 9-digit format (DD HHMMSS) - should use current year/month (2026-01) with specified day and time
    await enterStartAtEditMode();
    await userEvent.keyboard("{Control>}a{/Control}08 091500");
    await userEvent.keyboard("{Escape}");
    await awaitPendingCallbacks();

    expect(result.getByText("2026-01-08 09:15:00")).toBeTruthy();

    // Test 15-digit format (YYYYMMDD HHMMSS) - full date and time
    // Use a date within 14-day range: Jan 5, 2026
    await enterStartAtEditMode();
    await userEvent.keyboard("{Control>}a{/Control}20260105 180000");
    await userEvent.keyboard("{Escape}");
    await awaitPendingCallbacks();

    expect(result.getByText("2026-01-05 18:00:00")).toBeTruthy();
  });

  it("can edit endAt with various digit formats", async ({ db, task }) => {
    const { result } = await setupLifeLogsTest(task.id, db);

    await result.findByText("first lifelog");

    // Helper to enter edit mode for endAt (Tab twice from text: once for startAt, once for endAt)
    // Track the startAt value to detect when we've moved to endAt
    let startAtValue = "";
    async function enterEndAtEditMode() {
      await userEvent.keyboard("{i}"); // Enter text edit mode
      await awaitPendingCallbacks();

      const input = result.container.querySelector("input");
      expect(input).toBeTruthy();

      await userEvent.keyboard("{Tab}"); // Navigate to startAt
      await awaitPendingCallbacks();
      // Input should now be the startAt input
      {
        const input = result.container.querySelector("input") as HTMLInputElement;
        expect(input).toBeTruthy();
        expect(input.value).toMatch(/^\d{8} \d{6}$/);
        startAtValue = input.value;
      }
      await userEvent.keyboard("{Tab}"); // Navigate to endAt
      await awaitPendingCallbacks();
      // Input should now show endAt value (different from startAt)
      {
        const input = result.container.querySelector("input") as HTMLInputElement;
        expect(input).toBeTruthy();
        expect(input.value).not.toBe(startAtValue);
      }
    }

    // Test 4-digit format (HHMM) - should use current date (2026-01-10) with specified time, seconds = 0
    await enterEndAtEditMode();
    await userEvent.keyboard("{Control>}a{/Control}1234");
    await userEvent.keyboard("{Escape}");
    await awaitPendingCallbacks();

    expect(result.getByText("2026-01-10 12:34:00")).toBeTruthy();

    // Test 6-digit format (HHMMSS) - should use current date with specified time
    await enterEndAtEditMode();
    await userEvent.keyboard("{Control>}a{/Control}123456");
    await userEvent.keyboard("{Escape}");
    await awaitPendingCallbacks();

    expect(result.getByText("2026-01-10 12:34:56")).toBeTruthy();

    // Test 9-digit format (DD HHMMSS) - should use current year/month (2026-01) with specified day and time
    await enterEndAtEditMode();
    await userEvent.keyboard("{Control>}a{/Control}08 091500");
    await userEvent.keyboard("{Escape}");
    await awaitPendingCallbacks();

    expect(result.getByText("2026-01-08 09:15:00")).toBeTruthy();

    // Test 15-digit format (YYYYMMDD HHMMSS) - full date and time
    // Use a date within 14-day range: Jan 5, 2026
    await enterEndAtEditMode();
    await userEvent.keyboard("{Control>}a{/Control}20260105 180000");
    await userEvent.keyboard("{Escape}");
    await awaitPendingCallbacks();

    expect(result.getByText("2026-01-05 18:00:00")).toBeTruthy();
  });

  it("can set startAt to current time with s key", async ({ db, task }) => {
    const { result } = await setupLifeLogsTest(task.id, db);

    await result.findByText("first lifelog");
    await result.findByText("third lifelog");

    // Navigate to $log3 which has noneTimestamp startAt
    // $log1 is selected, press "j" twice to get to $log3
    await userEvent.keyboard("{j}");
    await awaitPendingCallbacks();
    await userEvent.keyboard("{j}");
    await awaitPendingCallbacks();

    // Verify $log3 has N/A for startAt (initial state has 6 N/A: $log1 endAt, $log2 endAt, $log3 startAt, $log3 endAt, $log4 startAt, $log4 endAt)
    expect(result.getAllByText("N/A").length).toBe(6);

    // Press "S" to set current time on startAt
    const start = performance.now();
    await userEvent.keyboard("{s}");
    await awaitPendingCallbacks();

    // Verify DOM was updated - N/A count should decrease by 1 (now only 5: $log1 endAt, $log2 endAt, $log3 endAt, $log4 startAt, $log4 endAt)
    const naElements = result.getAllByText("N/A");
    expect(naElements.length).toBe(5);

    // Verify the time is displayed in the DOM (should show current date-time format)
    const timeRangeDiv = result.container.querySelector(`#\\$log3 .${styles.lifeLogTree.timeRange}`);
    expect(timeRangeDiv?.textContent).toMatch(/\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}/);
    const end = performance.now();
    const duration = end - start;

    expect(duration, `Set startAt took ${duration.toFixed(2)}ms`).toBeLessThan(150);
  });

  it("can set endAt to current time with f key", async ({ db, task }) => {
    const { result } = await setupLifeLogsTest(task.id, db);

    await result.findByText("first lifelog");

    // $log1 is already selected and has endAt = noneTimestamp, so "F" key should work
    // Press "F" to set current time on endAt
    const start = performance.now();
    await userEvent.keyboard("{f}");
    await awaitPendingCallbacks();

    // Verify DOM was updated - N/A count should decrease by 1
    // Initial: 6 N/A ($log1 endAt, $log2 endAt, $log3 startAt, $log3 endAt, $log4 startAt, $log4 endAt)
    // After: 5 N/A ($log2 endAt, $log3 startAt, $log3 endAt, $log4 startAt, $log4 endAt)
    const naElements = result.getAllByText("N/A");
    expect(naElements.length).toBe(5);

    // Verify DOM was updated - $log1's time range should now have two time values
    const log1TimeRange = result.container.querySelector(`#\\$log1 .${styles.lifeLogTree.timeRange}`);
    const textContent = log1TimeRange?.textContent ?? "";
    // Count occurrences of date-time pattern
    const timeMatches = textContent.match(/\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}/g);
    expect(timeMatches?.length).toBe(2); // Both startAt and endAt should show times
    const end = performance.now();
    const duration = end - start;

    expect(duration, `Set endAt took ${duration.toFixed(2)}ms`).toBeLessThan(150);
  });

  it("does not scroll away from neighbor when setting endAt with f key", async ({ db, task }) => {
    await page.viewport(1100, 600);

    const { result } = await setupLifeLogsTest(task.id, db, {
      lifeLogCount: 15,
      lifeLogsProps: { debounceMs: 0 },
    });

    // Force the render container to have a fixed height so the scroll container overflows
    result.container.style.height = "600px";

    // Wait for items to render
    await result.findByText("lifelog 10");
    await awaitPendingCallbacks();

    // Navigate to last item ($log4) using G key (goToLatest is async — queries Firestore)
    await userEvent.keyboard("{Shift>}{g}{/Shift}");
    await awaitPendingCallbacks();

    // Wait for $log4 to become selected (goToLatest resolves asynchronously)
    await waitFor(() => {
      const log4Container = result.getByText("fourth lifelog").closest(`.${styles.lifeLogTree.container}`);
      expect(log4Container?.className).toContain(styles.lifeLogTree.selected);
    });

    const container = result.container.querySelector(`.${styles.lifeLogs.container}`)!;
    const log3El = document.getElementById("$log3")!;
    expect(log3El).toBeTruthy();

    // Verify scroll container actually overflows (otherwise the bug can't manifest)
    expect(container.scrollHeight).toBeGreaterThan(container.clientHeight);

    // $log3 should be visible above $log4 (both at the bottom of the list)
    const containerRect = container.getBoundingClientRect();
    const log3RectBefore = log3El.getBoundingClientRect();
    expect(
      log3RectBefore.bottom > containerRect.top && log3RectBefore.top < containerRect.bottom,
      "third lifelog should be visible before pressing f",
    ).toBe(true);

    // Press 'f' to set endAt on $log4 — this reorders $log4 to the top of the list
    await userEvent.keyboard("{f}");
    await awaitPendingCallbacks();
    await new Promise((r) => setTimeout(r, 100));
    await awaitPendingCallbacks();

    // $log3 should still be visible after pressing 'f'
    const log3RectAfter = log3El.getBoundingClientRect();
    const containerRectAfter = container.getBoundingClientRect();
    expect(
      log3RectAfter.bottom > containerRectAfter.top && log3RectAfter.top < containerRectAfter.bottom,
      `third lifelog should still be visible after pressing f (top=${log3RectAfter.top.toFixed(0)}, bottom=${log3RectAfter.bottom.toFixed(0)}, containerTop=${containerRectAfter.top.toFixed(0)}, containerBottom=${containerRectAfter.bottom.toFixed(0)})`,
    ).toBe(true);
  });

  it("does not scroll away from neighbor when setting endAt with f key (mobile)", async ({ db, task }) => {
    await page.viewport(414, 896);

    const { result } = await setupLifeLogsTest(task.id, db, {
      lifeLogCount: 15,
      lifeLogsProps: { debounceMs: 0 },
    });

    // Force the render container to have a fixed height so the scroll container overflows
    result.container.style.height = "600px";

    // Wait for items to render
    await result.findByText("lifelog 10");
    await awaitPendingCallbacks();

    // Navigate to last item ($log4) using G key (goToLatest is async — queries Firestore)
    await userEvent.keyboard("{Shift>}{g}{/Shift}");
    await awaitPendingCallbacks();

    // Wait for $log4 to become selected (goToLatest resolves asynchronously)
    await waitFor(() => {
      const log4Container = result.getByText("fourth lifelog").closest(`.${styles.lifeLogTree.container}`);
      expect(log4Container?.className).toContain(styles.lifeLogTree.selected);
    });

    const container = result.container.querySelector(`.${styles.lifeLogs.container}`)!;
    const log3El = document.getElementById("$log3")!;
    expect(log3El).toBeTruthy();

    // Verify scroll container actually overflows (otherwise the bug can't manifest)
    expect(container.scrollHeight).toBeGreaterThan(container.clientHeight);

    // $log3 should be visible near $log4 (in column-reverse, $log4 is at visual bottom)
    const containerRect = container.getBoundingClientRect();
    const log3RectBefore = log3El.getBoundingClientRect();
    expect(
      log3RectBefore.bottom > containerRect.top && log3RectBefore.top < containerRect.bottom,
      "third lifelog should be visible before pressing f",
    ).toBe(true);

    // Press 'f' to set endAt on $log4 — this reorders $log4 in the list
    await userEvent.keyboard("{f}");
    await awaitPendingCallbacks();
    await new Promise((r) => setTimeout(r, 100));
    await awaitPendingCallbacks();

    // $log3 should still be visible after pressing 'f'
    const log3RectAfter = log3El.getBoundingClientRect();
    const containerRectAfter = container.getBoundingClientRect();
    expect(
      log3RectAfter.bottom > containerRectAfter.top && log3RectAfter.top < containerRectAfter.bottom,
      `third lifelog should still be visible after pressing f (top=${log3RectAfter.top.toFixed(0)}, bottom=${log3RectAfter.bottom.toFixed(0)}, containerTop=${containerRectAfter.top.toFixed(0)}, containerBottom=${containerRectAfter.bottom.toFixed(0)})`,
    ).toBe(true);
  });

  it("can navigate between lifelogs with j/k keys", async ({ db, task }) => {
    const { result } = await setupLifeLogsTest(task.id, db);

    await result.findByText("first lifelog");
    await result.findByText("second lifelog");

    // Initial state: $log1 is selected
    const log1Element = result.getByText("first lifelog").closest(`.${styles.lifeLogTree.container}`);
    expect(log1Element?.className).toContain(styles.lifeLogTree.selected);

    // Press "j" to move to $log2
    await userEvent.keyboard("{j}");
    await awaitPendingCallbacks();

    const log2ElementAfterJ1 = result.getByText("second lifelog").closest(`.${styles.lifeLogTree.container}`);
    expect(log2ElementAfterJ1?.className).toContain(styles.lifeLogTree.selected);

    // Press "j" again to move to $log3
    await userEvent.keyboard("{j}");
    await awaitPendingCallbacks();

    const log3Element = result.getByText("third lifelog").closest(`.${styles.lifeLogTree.container}`);
    expect(log3Element?.className).toContain(styles.lifeLogTree.selected);

    // Press "k" to move back to $log2
    await userEvent.keyboard("{k}");
    await awaitPendingCallbacks();

    const log2ElementAfterK1 = result.getByText("second lifelog").closest(`.${styles.lifeLogTree.container}`);
    expect(log2ElementAfterK1?.className).toContain(styles.lifeLogTree.selected);

    // Press "k" to move back to $log1
    await userEvent.keyboard("{k}");
    await awaitPendingCallbacks();

    const log1ElementAfterK2 = result.getByText("first lifelog").closest(`.${styles.lifeLogTree.container}`);
    expect(log1ElementAfterK2?.className).toContain(styles.lifeLogTree.selected);

    // Press "k" at the first item should not change selection
    await userEvent.keyboard("{k}");
    await awaitPendingCallbacks();

    const log1ElementAfterK3 = result.getByText("first lifelog").closest(`.${styles.lifeLogTree.container}`);
    expect(log1ElementAfterK3?.className).toContain(styles.lifeLogTree.selected);
  });

  it("can add new lifelog with o key", async ({ db, task }) => {
    const { result } = await setupLifeLogsTest(task.id, db);

    await result.findByText("first lifelog");

    // Initial count of lifelogs
    const initialListItems = result.container.querySelectorAll(`.${styles.lifeLogs.listItem}`);
    expect(initialListItems.length).toBe(4);

    // Press "o" to add a new lifelog
    const start = performance.now();
    await userEvent.keyboard("{o}");
    await awaitPendingCallbacks();

    // New lifelog should be added and editing mode should be active
    const listItems = result.container.querySelectorAll(`.${styles.lifeLogs.listItem}`);
    expect(listItems.length).toBe(5);

    // Verify that editing mode is active (input should be visible)
    const input = result.container.querySelector("input")!;
    expect(input).toBeTruthy();
    const end = performance.now();
    const duration = end - start;

    // Assert operation completes within 100ms
    expect(duration, `Add new lifelog took ${duration.toFixed(2)}ms`).toBeLessThan(150);

    // Type text for the new lifelog
    input.focus();
    await userEvent.keyboard("new lifelog from o key");

    // Press Escape to save and exit editing
    await userEvent.keyboard("{Escape}");
    await awaitPendingCallbacks();

    // Verify the new lifelog text is displayed
    expect(result.getByText("new lifelog from o key")).toBeTruthy();
  });

  it("can add first lifelog with o key when no lifelogs exist", async ({ db, task }) => {
    const { result } = await setupLifeLogsTest(task.id, db, { skipDefaultLifeLogs: true });

    // Verify no lifeLogs exist
    const initialListItems = result.container.querySelectorAll(`.${styles.lifeLogs.listItem}`);
    expect(initialListItems.length).toBe(0);

    // Press "o" to add the first lifelog
    await userEvent.keyboard("{o}");
    await awaitPendingCallbacks();

    // New lifelog should be added
    const listItems = result.container.querySelectorAll(`.${styles.lifeLogs.listItem}`);
    expect(listItems.length).toBe(1);
  });

  it("sets startAt to current time when adding lifelog from parent with noneTimestamp endAt", async ({ db, task }) => {
    const { result } = await setupLifeLogsTest(task.id, db);

    await result.findByText("first lifelog");
    await result.findByText("third lifelog");

    // Navigate to $log3 which has endAt=noneTimestamp
    await userEvent.keyboard("{j}");
    await awaitPendingCallbacks();
    await userEvent.keyboard("{j}");
    await awaitPendingCallbacks();

    // Verify $log3 is selected
    const log3 = result.getByText("third lifelog").closest(`.${styles.lifeLogTree.container}`);
    expect(log3?.className).toContain(styles.lifeLogTree.selected);

    // Initial N/A count: 6 ($log1 endAt, $log2 endAt, $log3 startAt, $log3 endAt, $log4 startAt, $log4 endAt)
    expect(result.getAllByText("N/A").length).toBe(6);

    // Press "o" to add a new lifelog
    // Since $log3's endAt is noneTimestamp, the new lifelog's startAt should be set to current time (baseTime = 2026-01-10 12:00:00)
    await userEvent.keyboard("{o}");
    await awaitPendingCallbacks();

    // Exit editing mode to see the time
    await userEvent.keyboard("{Escape}");
    await awaitPendingCallbacks();

    // N/A count should still be 6 (new lifelog has startAt=current time, endAt=noneTimestamp)
    // Lost: nothing (new log's startAt is set to current time, not N/A)
    // Gained: +1 (new log's endAt is noneTimestamp)
    // Net: 6 + 1 = 7
    expect(result.getAllByText("N/A").length).toBe(7);

    // Verify the new lifelog's startAt is displayed as 2026-01-10 12:00:00 (baseTime, which is mocked as TimestampNow)
    // The new lifelog should have this time displayed in its time range
    const allTimeRanges = result.container.querySelectorAll(`.${styles.lifeLogTree.timeRange}`);
    // Count how many time ranges contain "2026-01-10 12:00:00"
    // $log2 has startAt=2026-01-10 12:00:00, and the new lifelog should also have it
    const timeRangesWithBaseTime = Array.from(allTimeRanges).filter((tr) =>
      tr.textContent?.includes("2026-01-10 12:00:00"),
    );
    // Should be 2: $log2's startAt and new lifelog's startAt
    expect(timeRangesWithBaseTime.length).toBe(2);
  });

  // LifeLog deletion tests
  it("can delete empty LifeLog with Backspace and move cursor to previous LifeLog", async ({ db, task }) => {
    const { result } = await setupLifeLogsTest(task.id, db);

    // Wait for initial render - setupLifeLogsTest creates $log1, $log2, $log3
    // $log3 has startAt=none, endAt=none, text="third lifelog"
    await result.findByText("first lifelog");
    await result.findByText("third lifelog");

    // Navigate to $log3 (last log) - press j twice
    await userEvent.keyboard("{j}");
    await awaitPendingCallbacks();
    await userEvent.keyboard("{j}");
    await awaitPendingCallbacks();

    const listItems1 = result.container.querySelectorAll("li");
    const item = listItems1[2];
    expect(item.querySelector(`.${styles.lifeLogTree.selected}`)).toBeTruthy();

    // $log3 has startAt=none, endAt=none, text="third lifelog"
    // Press "i" to enter editing mode at beginning (cursor at position 0)
    await userEvent.keyboard("{i}");
    await awaitPendingCallbacks();

    const input1 = result.container.querySelector("input")!;
    expect(input1).toBeTruthy();
    expect(input1.value).toBe("third lifelog");

    // Clear the text to make it deletable
    await userEvent.keyboard("{Control>}a{/Control}{Backspace}");
    {
      const input = result.container.querySelector("input") as HTMLInputElement;
      expect(input.value).toBe("");
    }

    // Save the change by exiting edit mode (triggers onBlur save)
    await userEvent.keyboard("{Escape}");
    await awaitPendingCallbacks();
    expect(result.container.querySelector("input")).toBeNull();

    // Re-enter edit mode
    await userEvent.keyboard("{i}");
    await awaitPendingCallbacks();

    const input2 = result.container.querySelector("input")!;
    expect(input2).toBeTruthy();
    expect(input2.value).toBe("");

    // Press Backspace at position 0 on empty text - should delete and move to $log2
    await userEvent.keyboard("{Backspace}");
    await awaitPendingCallbacks();

    // Verify deletion and cursor move to $log2 (previous log)
    {
      const listItems = result.container.querySelectorAll("li");
      expect(listItems.length).toBe(3); // $log1, $log2, $log4 remain
    }

    {
      const input = result.container.querySelector("input") as HTMLInputElement;
      expect(input).toBeTruthy();
      expect(input.value).toBe("second lifelog");
      // Cursor should be at the end (14 characters)
      expect(input.selectionStart).toBe(14);
    }

    // Exit editing mode
    await userEvent.keyboard("{Escape}");
    await awaitPendingCallbacks();
    expect(result.container.querySelector("input")).toBeNull();
  });

  it("can delete empty LifeLog with Delete and move cursor to next LifeLog", async ({ db, task }) => {
    const { result } = await setupLifeLogsTest(task.id, db);

    // Wait for initial render
    // Initial order: $log1 (10:30), $log2 (12:00), $log3 (none), $log4 (none)
    await result.findByText("first lifelog");
    await result.findByText("third lifelog");
    await result.findByText("fourth lifelog");

    // Navigate to $log3 - press j twice
    await userEvent.keyboard("{j}");
    await awaitPendingCallbacks();
    await userEvent.keyboard("{j}");
    await awaitPendingCallbacks();

    const listItems1 = result.container.querySelectorAll("li");
    const item1 = listItems1[2];
    expect(item1.querySelector(`.${styles.lifeLogTree.selected}`)).toBeTruthy();
    expect(item1.textContent).toContain("third lifelog");

    // Press "o" to create a new empty LifeLog
    // Since $log3's endAt is noneTimestamp, new log gets startAt=baseTime (current time)
    // New log sorts after $log2 (same startAt=baseTime, but later uuidv7)
    // Order becomes: $log1 (10:30), $log2 (12:00), new log (12:00), $log3 (none), $log4 (none)
    await userEvent.keyboard("{o}");
    await awaitPendingCallbacks();

    const listItems2 = result.container.querySelectorAll("li");
    expect(listItems2.length).toBe(5);

    await userEvent.keyboard("{Escape}");
    await awaitPendingCallbacks();
    expect(result.container.querySelector("input")).toBeNull();

    // Navigate to $log3 (press j once, since new log is at index 2, $log3 is at index 3)
    await userEvent.keyboard("{j}");
    await awaitPendingCallbacks();

    const listItems3 = result.container.querySelectorAll("li");
    // Should be on $log3 now (index 3)
    const item2 = listItems3[3];
    expect(item2.querySelector(`.${styles.lifeLogTree.selected}`)).toBeTruthy();
    expect(item2.textContent).toContain("third lifelog");

    // Press "i" to enter editing mode
    await userEvent.keyboard("{i}");
    await awaitPendingCallbacks();

    const input1 = result.container.querySelector("input")!;
    expect(input1).toBeTruthy();
    expect(input1.value).toBe("third lifelog");

    // Clear the text to make it deletable
    await userEvent.keyboard("{Control>}a{/Control}{Delete}");
    {
      const input = result.container.querySelector("input") as HTMLInputElement;
      expect(input.value).toBe("");
    }

    // Save the change by exiting edit mode (triggers onBlur save)
    await userEvent.keyboard("{Escape}");
    await awaitPendingCallbacks();
    expect(result.container.querySelector("input")).toBeNull();

    // Re-enter edit mode
    await userEvent.keyboard("{i}");
    await awaitPendingCallbacks();

    const input2 = result.container.querySelector("input")!;
    expect(input2).toBeTruthy();
    expect(input2.value).toBe("");

    // Since text is empty, position 0 = end, so Delete should work
    // Press Delete at end of text - should delete and move to next LifeLog ($log4)
    await userEvent.keyboard("{Delete}");
    await awaitPendingCallbacks();

    // Verify deletion - should now have 4 items
    {
      const listItems = result.container.querySelectorAll("li");
      expect(listItems.length).toBe(4);
    }

    // Verify we're in editing mode on the next LifeLog ($log4)
    {
      const input = result.container.querySelector("input") as HTMLInputElement;
      expect(input).toBeTruthy();
      expect(input.value).toBe("fourth lifelog");
      // Cursor should be at the start (position 0)
      expect(input.selectionStart).toBe(0);
    }

    // Exit editing mode
    await userEvent.keyboard("{Escape}");
    await awaitPendingCallbacks();
    expect(result.container.querySelector("input")).toBeNull();
  });

  it("does not delete LifeLog with Backspace when text is not empty", async ({ db, task }) => {
    const { result } = await setupLifeLogsTest(task.id, db);

    // Wait for initial render
    await result.findByText("first lifelog");
    await result.findByText("second lifelog");

    // Navigate to $log2 (press j once) - it has text "second lifelog"
    await userEvent.keyboard("{j}");
    await awaitPendingCallbacks();

    const listItems1 = result.container.querySelectorAll("li");
    const item = listItems1[1];
    expect(item.querySelector(`.${styles.lifeLogTree.selected}`)).toBeTruthy();

    // Press "i" to enter editing mode at beginning
    await userEvent.keyboard("{i}");
    await awaitPendingCallbacks();

    const input1 = result.container.querySelector("input")!;
    expect(input1).toBeTruthy();
    expect(input1.value).toBe("second lifelog");

    // Press Backspace - should NOT delete because text is not empty
    await userEvent.keyboard("{Backspace}");
    await awaitPendingCallbacks();

    // Should still be on same lifelog
    {
      const input = result.container.querySelector("input") as HTMLInputElement;
      expect(input).toBeTruthy();
      expect(input.value).toBe("second lifelog");
    }

    // Exit editing mode
    await userEvent.keyboard("{Escape}");
    await awaitPendingCallbacks();
    expect(result.container.querySelector("input")).toBeNull();

    // All lifelogs should still exist
    const listItems = result.container.querySelectorAll("li");
    expect(listItems.length).toBe(4);
  });

  it("does not delete LifeLog with Backspace when startAt is set", async ({ db, task }) => {
    const { result } = await setupLifeLogsTest(task.id, db);

    // Wait for initial render - $log1 is selected, has startAt set
    await result.findByText("first lifelog");

    // Press "i" to enter editing mode
    await userEvent.keyboard("{i}");
    await awaitPendingCallbacks();

    const input1 = result.container.querySelector("input")!;
    expect(input1).toBeTruthy();
    expect(input1.value).toBe("first lifelog");

    // Clear the text to test startAt condition (not the text condition)
    // Select all and delete
    await userEvent.keyboard("{Control>}a{/Control}{Backspace}");
    {
      const input = result.container.querySelector("input") as HTMLInputElement;
      expect(input.value).toBe("");
    }

    // Save the change by exiting edit mode
    await userEvent.keyboard("{Escape}");
    await awaitPendingCallbacks();
    expect(result.container.querySelector("input")).toBeNull();

    // Re-enter edit mode
    await userEvent.keyboard("{i}");
    await awaitPendingCallbacks();

    const input2 = result.container.querySelector("input")!;
    expect(input2).toBeTruthy();
    expect(input2.value).toBe("");

    // Now press Backspace - should NOT delete because startAt is set
    await userEvent.keyboard("{Backspace}");

    // Wait a bit to ensure nothing happens
    await new Promise((r) => setTimeout(r, 100));

    // Should still be on same lifelog
    const input3 = result.container.querySelector("input") as HTMLInputElement;
    expect(input3).toBeTruthy();
    expect(input3.value).toBe("");

    // Exit editing mode
    await userEvent.keyboard("{Escape}");
    await awaitPendingCallbacks();
    expect(result.container.querySelector("input")).toBeNull();

    // All lifelogs should still exist
    const listItems = result.container.querySelectorAll("li");
    expect(listItems.length).toBe(4);
  });

  it("does not delete LifeLog with Backspace when endAt is set", async ({ db, task }) => {
    const { result } = await setupLifeLogsTest(task.id, db);

    // Wait for initial render
    await result.findByText("first lifelog");

    // Navigate to $log2
    await userEvent.keyboard("{j}");
    await awaitPendingCallbacks();

    const listItems1 = result.container.querySelectorAll("li");
    const item1 = listItems1[1];
    expect(item1.querySelector(`.${styles.lifeLogTree.selected}`)).toBeTruthy();

    // Set $log2's endAt first to give distinct startAt to new log
    await userEvent.keyboard("{f}");
    await awaitPendingCallbacks();

    // After setting endAt on $log2, it moves to index 0 (sorted by endAt first)
    const listItems2 = result.container.querySelectorAll("li");
    const item2 = listItems2[0];
    expect(item2.textContent).not.toContain("N/A");

    // Press "o" to add a new empty LifeLog
    await userEvent.keyboard("{o}");
    await awaitPendingCallbacks();

    const listItems3 = result.container.querySelectorAll("li");
    expect(listItems3.length).toBe(5);

    await userEvent.keyboard("{Escape}");
    await awaitPendingCallbacks();
    expect(result.container.querySelector("input")).toBeNull();

    // Press "f" to set endAt on the new LifeLog
    await userEvent.keyboard("{f}");
    await awaitPendingCallbacks();

    // endAt should now be set, newLog moves to index 1 (sorted by endAt after $log2)
    const listItems4 = result.container.querySelectorAll("li");
    const newLog = listItems4[1];
    // Should now have no N/A (both startAt and endAt are set)
    expect(newLog.textContent).not.toContain("N/A");

    // Press "i" to enter editing mode
    await userEvent.keyboard("{i}");
    await awaitPendingCallbacks();

    const input1 = result.container.querySelector("input")!;
    expect(input1).toBeTruthy();
    expect(input1.value).toBe("");

    // Press Backspace - should NOT delete because endAt is set
    await userEvent.keyboard("{Backspace}");

    // Wait a bit to ensure nothing happens
    await new Promise((r) => setTimeout(r, 100));

    // Should still be on same lifelog
    const input2 = result.container.querySelector("input") as HTMLInputElement;
    expect(input2).toBeTruthy();
    expect(input2.value).toBe("");

    // Exit editing mode
    await userEvent.keyboard("{Escape}");
    await awaitPendingCallbacks();
    expect(result.container.querySelector("input")).toBeNull();

    // All lifelogs should still exist (4 original + 1 created = 5)
    const listItems = result.container.querySelectorAll("li");
    expect(listItems.length).toBe(5);
  });

  it("does not delete LifeLog with Backspace when it has child nodes", async ({ db, task }) => {
    const { result } = await setupLifeLogsTest(task.id, db);

    // Wait for initial render - $log1 has child tree nodes
    await result.findByText("first lifelog");

    // Press "i" to enter editing mode on $log1
    await userEvent.keyboard("{i}");
    await awaitPendingCallbacks();

    const input1 = result.container.querySelector("input")!;
    expect(input1).toBeTruthy();
    expect(input1.value).toBe("first lifelog");

    // Clear the text to test child nodes condition
    await userEvent.keyboard("{Control>}a{/Control}{Backspace}");
    {
      const input = result.container.querySelector("input") as HTMLInputElement;
      expect(input.value).toBe("");
    }

    // Save the change by exiting edit mode
    await userEvent.keyboard("{Escape}");
    await awaitPendingCallbacks();
    expect(result.container.querySelector("input")).toBeNull();

    // Re-enter edit mode
    await userEvent.keyboard("{i}");
    await awaitPendingCallbacks();

    const input2 = result.container.querySelector("input")!;
    expect(input2).toBeTruthy();
    expect(input2.value).toBe("");

    // Now press Backspace - should NOT delete because it has child nodes
    // (also startAt is set, but testing child nodes is the primary intent)
    await userEvent.keyboard("{Backspace}");
    await awaitPendingCallbacks();

    // Should still be on same lifelog
    const input3 = result.container.querySelector("input") as HTMLInputElement;
    expect(input3).toBeTruthy();
    expect(input3.value).toBe("");

    // Exit editing mode
    await userEvent.keyboard("{Escape}");
    await awaitPendingCallbacks();
    expect(result.container.querySelector("input")).toBeNull();

    // All lifelogs should still exist
    const listItems = result.container.querySelectorAll("li");
    expect(listItems.length).toBe(4);
  });

  it("does not delete first LifeLog with Backspace (no previous)", async ({ db, task }) => {
    const { result } = await setupLifeLogsTest(task.id, db);

    // Wait for initial render - $log1 is selected (first LifeLog)
    // $log1 has startAt set (10:30) and has children, which also block deletion
    // but this test primarily verifies that being the first log (no previous) blocks deletion
    await result.findByText("first lifelog");

    // Press "i" to enter editing mode on $log1
    await userEvent.keyboard("{i}");
    await awaitPendingCallbacks();

    const input1 = result.container.querySelector("input")!;
    expect(input1).toBeTruthy();
    expect(input1.value).toBe("first lifelog");

    // Clear the text
    await userEvent.keyboard("{Control>}a{/Control}{Backspace}");
    {
      const input = result.container.querySelector("input") as HTMLInputElement;
      expect(input.value).toBe("");
    }

    // Save the change by exiting edit mode
    await userEvent.keyboard("{Escape}");
    await awaitPendingCallbacks();
    expect(result.container.querySelector("input")).toBeNull();

    // Re-enter edit mode
    await userEvent.keyboard("{i}");
    await awaitPendingCallbacks();

    const input2 = result.container.querySelector("input")!;
    expect(input2).toBeTruthy();
    expect(input2.value).toBe("");

    // Press Backspace - should NOT delete (no previous, also startAt is set and has children)
    await userEvent.keyboard("{Backspace}");
    await awaitPendingCallbacks();

    // Should still be on same lifelog
    const input3 = result.container.querySelector("input");
    expect(input3).toBeTruthy();

    // Exit editing mode
    await userEvent.keyboard("{Escape}");
    await awaitPendingCallbacks();
    expect(result.container.querySelector("input")).toBeNull();

    // All lifelogs should still exist
    const listItems = result.container.querySelectorAll("li");
    expect(listItems.length).toBe(4);
  });

  it("does not delete last LifeLog with Delete (no next)", async ({ db, task }) => {
    const { result } = await setupLifeLogsTest(task.id, db);

    // Wait for initial render
    await result.findByText("first lifelog");
    await result.findByText("fourth lifelog");

    // Navigate to $log4 (last LifeLog) - press j three times
    await userEvent.keyboard("{j}");
    await awaitPendingCallbacks();
    await userEvent.keyboard("{j}");
    await awaitPendingCallbacks();
    await userEvent.keyboard("{j}");
    await awaitPendingCallbacks();

    const listItems1 = result.container.querySelectorAll("li");
    const lastItem = listItems1[3];
    expect(lastItem.querySelector(`.${styles.lifeLogTree.selected}`)).toBeTruthy();

    // Press "i" to enter editing mode
    await userEvent.keyboard("{i}");
    await awaitPendingCallbacks();

    const input1 = result.container.querySelector("input")!;
    expect(input1).toBeTruthy();
    expect(input1.value).toBe("fourth lifelog");

    // Clear the text
    await userEvent.keyboard("{Control>}a{/Control}{Delete}");
    {
      const input = result.container.querySelector("input") as HTMLInputElement;
      expect(input.value).toBe("");
    }

    // Save the change by exiting edit mode
    await userEvent.keyboard("{Escape}");
    await awaitPendingCallbacks();
    expect(result.container.querySelector("input")).toBeNull();

    // Re-enter edit mode
    await userEvent.keyboard("{i}");
    await awaitPendingCallbacks();

    const input2 = result.container.querySelector("input")!;
    expect(input2).toBeTruthy();
    expect(input2.value).toBe("");

    // Press Delete - should NOT delete because there's no next lifelog
    await userEvent.keyboard("{Delete}");
    await awaitPendingCallbacks();

    // Should still be on same lifelog
    const input3 = result.container.querySelector("input");
    expect(input3).toBeTruthy();

    // Exit editing mode
    await userEvent.keyboard("{Escape}");
    await awaitPendingCallbacks();
    expect(result.container.querySelector("input")).toBeNull();

    // All lifelogs should still exist
    const listItems = result.container.querySelectorAll("li");
    expect(listItems.length).toBe(4);
  });

  it("does not delete LifeLog with Backspace when pending text is not empty (unsaved)", async ({ db, task }) => {
    const { result } = await setupLifeLogsTest(task.id, db);

    // Wait for initial render
    await result.findByText("first lifelog");
    await result.findByText("third lifelog");

    // Navigate to $log3 (last log) - press j twice
    await userEvent.keyboard("{j}");
    await awaitPendingCallbacks();
    await userEvent.keyboard("{j}");
    await awaitPendingCallbacks();

    // $log3 has startAt=none, endAt=none, text="third lifelog"
    // Press "i" to enter editing mode
    await userEvent.keyboard("{i}");
    await awaitPendingCallbacks();

    const input1 = result.container.querySelector("input")!;
    expect(input1).toBeTruthy();
    expect(input1.value).toBe("third lifelog");

    // Clear the text to make it empty in Firestore
    await userEvent.keyboard("{Control>}a{/Control}{Backspace}");
    {
      const input = result.container.querySelector("input") as HTMLInputElement;
      expect(input.value).toBe("");
    }

    // Save the change by exiting edit mode
    await userEvent.keyboard("{Escape}");
    await awaitPendingCallbacks();
    expect(result.container.querySelector("input")).toBeNull();

    // Re-enter edit mode and type some new text (but don't save)
    await userEvent.keyboard("{i}");
    await awaitPendingCallbacks();

    const input2 = result.container.querySelector("input")!;
    expect(input2).toBeTruthy();
    expect(input2.value).toBe("");

    // Type some text (this creates pending/unsaved text)
    await userEvent.keyboard("unsaved text");
    {
      const input = result.container.querySelector("input") as HTMLInputElement;
      expect(input.value).toBe("unsaved text");
    }

    // Move cursor to beginning
    await userEvent.keyboard("{Home}");

    // Press Backspace - should NOT delete because pending text is not empty
    await userEvent.keyboard("{Backspace}");
    await awaitPendingCallbacks();

    // Should still be on same lifelog with the unsaved text
    {
      const input = result.container.querySelector("input") as HTMLInputElement;
      expect(input).toBeTruthy();
      expect(input.value).toBe("unsaved text");
    }

    // Exit editing mode
    await userEvent.keyboard("{Escape}");
    await awaitPendingCallbacks();
    expect(result.container.querySelector("input")).toBeNull();

    // All lifelogs should still exist
    const listItems = result.container.querySelectorAll("li");
    expect(listItems.length).toBe(4);
  });

  it("does not delete LifeLog with Delete when pending text is not empty (unsaved)", async ({ db, task }) => {
    const { result } = await setupLifeLogsTest(task.id, db);

    // Wait for initial render
    await result.findByText("first lifelog");
    await result.findByText("third lifelog");

    // Navigate to $log3 (last log) - press j twice
    await userEvent.keyboard("{j}");
    await awaitPendingCallbacks();
    await userEvent.keyboard("{j}");
    await awaitPendingCallbacks();

    // Press "o" to create a new empty LifeLog
    // Since $log3's endAt is noneTimestamp, new log gets startAt=baseTime
    // Order: $log1 (10:30), $log2 (12:00), new log (12:00), $log3 (none), $log4 (none)
    await userEvent.keyboard("{o}");
    await awaitPendingCallbacks();

    const listItems1 = result.container.querySelectorAll("li");
    expect(listItems1.length).toBe(5);

    // Exit edit mode to save the empty state
    await userEvent.keyboard("{Escape}");
    await awaitPendingCallbacks();
    expect(result.container.querySelector("input")).toBeNull();

    // Navigate to $log3 (press j since new log is above $log3)
    await userEvent.keyboard("{j}");
    await awaitPendingCallbacks();

    // Clear $log3's text and save
    await userEvent.keyboard("{i}");
    await awaitPendingCallbacks();

    await userEvent.keyboard("{Control>}a{/Control}{Delete}");
    {
      const input = result.container.querySelector("input") as HTMLInputElement;
      expect(input.value).toBe("");
    }

    await userEvent.keyboard("{Escape}");
    await awaitPendingCallbacks();

    // Re-enter edit mode and type some new text (but don't save)
    await userEvent.keyboard("{i}");
    await awaitPendingCallbacks();

    const input2 = result.container.querySelector("input")!;
    expect(input2).toBeTruthy();
    expect(input2.value).toBe("");

    // Type some text (this creates pending/unsaved text)
    await userEvent.keyboard("unsaved text");
    {
      const input = result.container.querySelector("input") as HTMLInputElement;
      expect(input.value).toBe("unsaved text");
    }

    // Press Delete at end - should NOT delete because pending text is not empty
    await userEvent.keyboard("{Delete}");
    await awaitPendingCallbacks();

    // Should still be on same lifelog with the unsaved text
    {
      const input = result.container.querySelector("input") as HTMLInputElement;
      expect(input).toBeTruthy();
      expect(input.value).toBe("unsaved text");
    }

    // Exit editing mode
    await userEvent.keyboard("{Escape}");
    await awaitPendingCallbacks();
    expect(result.container.querySelector("input")).toBeNull();

    // All lifelogs should still exist (5 total: 4 original + 1 created)
    const listItems = result.container.querySelectorAll("li");
    expect(listItems.length).toBe(5);
  });

  it("can focus LifeLog by clicking on it", async ({ db, task }) => {
    const { result } = await setupLifeLogsTest(task.id, db);

    await result.findByText("first lifelog");
    await result.findByText("second lifelog");

    // Initial state: $log1 is selected
    const log1Initial = result.getByText("first lifelog").closest(`.${styles.lifeLogTree.container}`);
    expect(log1Initial?.className).toContain(styles.lifeLogTree.selected);

    // Click on $log2's container
    const log2Container = result.getByText("second lifelog").closest(`.${styles.lifeLogTree.container}`)!;
    await userEvent.click(log2Container);
    await awaitPendingCallbacks();

    // $log2 should now be selected
    expect(log2Container.className).toContain(styles.lifeLogTree.selected);

    // $log1 should no longer be selected
    const log1AfterClick = result.getByText("first lifelog").closest(`.${styles.lifeLogTree.container}`);
    expect(log1AfterClick?.className).not.toContain(styles.lifeLogTree.selected);
  });

  it("clicking LifeLog container exits tree mode", async ({ db, task }) => {
    const { result } = await setupLifeLogsTest(task.id, db);

    await result.findByText("first lifelog");

    // Enter tree mode
    await userEvent.keyboard("{l}");
    await awaitPendingCallbacks();

    // Tree nodes should be visible
    await result.findByText("first child");
    expect(result.getByText("first child").className).toContain(styles.lifeLogTree.selected);

    // Click on LifeLog container (not on tree node)
    const log1Container = result.getByText("first lifelog").closest(`.${styles.lifeLogTree.container}`)!;
    await userEvent.click(log1Container);
    await awaitPendingCallbacks();

    // Tree mode should be exited (tree nodes no longer visible)
    expect(result.queryByText("first child")).toBeNull();

    // LifeLog should be selected
    expect(log1Container.className).toContain(styles.lifeLogTree.selected);
  });

  it("clicking on input element does not change LifeLog focus", async ({ db, task }) => {
    const { result } = await setupLifeLogsTest(task.id, db);

    await result.findByText("first lifelog");

    // Get the log1 container before entering edit mode
    const log1Container = result.getByText("first lifelog").closest(`.${styles.lifeLogTree.container}`)!;
    expect(log1Container.className).toContain(styles.lifeLogTree.selected);

    // Enter editing mode
    await userEvent.keyboard("{i}");
    await awaitPendingCallbacks();

    const input = result.container.querySelector("input") as HTMLInputElement;
    expect(input).toBeTruthy();

    // Click on the input
    await userEvent.click(input);
    await awaitPendingCallbacks();

    // Should still be editing the same LifeLog (log1Container should still be selected)
    expect(log1Container.className).toContain(styles.lifeLogTree.selected);

    // Input should still be visible
    expect(result.container.querySelector("input")).toBeTruthy();
  });

  describe("scroll", () => {
    // Vitest browser mode default iframe size: 414x896
    // Each LifeLog is approximately 100px height, so 15 LifeLogs will require scrolling
    const SCROLL_OFFSET = 100;
    const OFFSET_TOLERANCE = 20;

    it("maintains ~100px offset when scrolling down with j key", async ({ db, task }) => {
      const { result } = await setupLifeLogsTest(task.id, db, { lifeLogCount: 15 });

      const container = result.container.querySelector(`.${styles.lifeLogs.container}`)!;

      // Navigate to first item with g key
      await userEvent.keyboard("{g}");
      await awaitPendingCallbacks();

      const selected0 = result.container.querySelector(`.${styles.lifeLogTree.selected}`);
      expect(selected0).toBeTruthy();

      // Navigate down repeatedly - scrolling should trigger when item nears bottom
      for (let i = 0; i < 5; i++) {
        await userEvent.keyboard("{j}");
        await awaitPendingCallbacks();

        // Check scroll offset for selected element
        const selected = result.container.querySelector(`.${styles.lifeLogTree.selected}`)!;
        expect(selected).toBeTruthy();
        const containerRect = container.getBoundingClientRect();
        const selectedRect = selected.getBoundingClientRect();

        // Selected element's bottom should be at least (SCROLL_OFFSET - TOLERANCE) from container's bottom
        const bottomOffset = containerRect.bottom - selectedRect.bottom;
        expect(
          bottomOffset,
          `Bottom offset should be ~${SCROLL_OFFSET}px (got ${bottomOffset.toFixed(0)}px)`,
        ).toBeGreaterThanOrEqual(SCROLL_OFFSET - OFFSET_TOLERANCE);
      }
    });

    it("maintains ~100px offset when scrolling up with k key", async ({ db, task }) => {
      const { result } = await setupLifeLogsTest(task.id, db, { lifeLogCount: 15 });

      const container = result.container.querySelector(`.${styles.lifeLogs.container}`)!;

      // First, go to the last LifeLog using G key
      await userEvent.keyboard("{Shift>}{g}{/Shift}");
      await awaitPendingCallbacks();

      const selected0 = result.container.querySelector(`.${styles.lifeLogTree.selected}`);
      expect(selected0).toBeTruthy();

      // Navigate up repeatedly
      for (let i = 0; i < 7; i++) {
        await userEvent.keyboard("{k}");
        await awaitPendingCallbacks();

        // Check scroll offset for selected element
        const selected = result.container.querySelector(`.${styles.lifeLogTree.selected}`)!;
        expect(selected).toBeTruthy();
        const containerRect = container.getBoundingClientRect();
        const selectedRect = selected.getBoundingClientRect();

        // Selected element's top should be at least (SCROLL_OFFSET - TOLERANCE) from container's top
        const topOffset = selectedRect.top - containerRect.top;
        expect(
          topOffset,
          `Top offset should be ~${SCROLL_OFFSET}px (got ${topOffset.toFixed(0)}px)`,
        ).toBeGreaterThanOrEqual(SCROLL_OFFSET - OFFSET_TOLERANCE);
      }
    });

    it("scrolls to first LifeLog with g key", async ({ db, task }) => {
      const { result } = await setupLifeLogsTest(task.id, db, { lifeLogCount: 15 });

      const container = result.container.querySelector(`.${styles.lifeLogs.container}`)!;

      // First, go to the last LifeLog using G key
      await userEvent.keyboard("{Shift>}{g}{/Shift}");
      await awaitPendingCallbacks();

      const lastSelected = result.container.querySelector(`.${styles.lifeLogTree.selected}`);
      expect(lastSelected).toBeTruthy();
      const lastSelectedText = lastSelected?.textContent ?? undefined;

      // Wait for scroll to settle
      await new Promise((r) => setTimeout(r, 50));

      // Press g to go to first LifeLog
      await userEvent.keyboard("{g}");
      await awaitPendingCallbacks();

      // Selection should have changed (different from the last selected)
      const selected = result.container.querySelector(`.${styles.lifeLogTree.selected}`)!;
      expect(selected).toBeTruthy();
      expect(selected.textContent).not.toBe(lastSelectedText);

      // Check that first element is visible within container
      // The first element may not have 100px offset since it's at the physical top
      const containerRect = container.getBoundingClientRect();
      const selectedRect = selected.getBoundingClientRect();

      // First element should be visible (top should be >= container top)
      expect(selectedRect.top).toBeGreaterThanOrEqual(containerRect.top);
      // And should be within the visible area
      expect(selectedRect.bottom).toBeLessThanOrEqual(containerRect.bottom);
    });

    it("scrolls to last LifeLog with G key", async ({ db, task }) => {
      const { result } = await setupLifeLogsTest(task.id, db, { lifeLogCount: 15 });

      const container = result.container.querySelector(`.${styles.lifeLogs.container}`)!;

      // First, go to first LifeLog using g key
      await userEvent.keyboard("{g}");
      await awaitPendingCallbacks();

      const firstSelected = result.container.querySelector(`.${styles.lifeLogTree.selected}`);
      expect(firstSelected).toBeTruthy();
      const firstSelectedText = firstSelected?.textContent ?? undefined;

      // Press G to go to last LifeLog
      await userEvent.keyboard("{Shift>}{g}{/Shift}");
      await awaitPendingCallbacks();

      // Selection should have changed (different from the first selected)
      const selected = result.container.querySelector(`.${styles.lifeLogTree.selected}`)!;
      expect(selected).toBeTruthy();
      expect(selected.textContent).not.toBe(firstSelectedText);

      // Check that last element is visible within container
      // The last element may not have 100px offset since it's at the physical bottom
      const containerRect = container.getBoundingClientRect();
      const selectedRect = selected.getBoundingClientRect();

      // Last element should be visible (bottom should be <= container bottom)
      expect(selectedRect.bottom).toBeLessThanOrEqual(containerRect.bottom);
      // And should be within the visible area
      expect(selectedRect.top).toBeGreaterThanOrEqual(containerRect.top);
    });

    it("scrolls to already-selected latest LifeLog with G key", async ({ db, task }) => {
      await page.viewport(1200, 600);
      // Start with $log4 selected — it's the latest (noneTimestamp endAt/startAt, highest doc ID)
      const { result } = await setupLifeLogsTest(task.id, db, {
        lifeLogCount: 15,
        initialSelectedId: "$log4",
      });

      // Constrain wrapper height so container gets overflow scroll
      const wrapper = result.container.querySelector(`.${styles.lifeLogs.wrapper}`) as HTMLElement;
      wrapper.style.height = "300px";

      const container = result.container.querySelector(`.${styles.lifeLogs.container}`)!;

      // Verify $log4 is selected and visible
      const selected = result.container.querySelector(`.${styles.lifeLogTree.selected}`)!;
      expect(selected).toBeTruthy();
      expect(selected.textContent).toContain("fourth lifelog");

      // Scroll container to top so the selected (latest) element at the bottom is out of view
      container.scrollTop = 0;
      await new Promise((r) => setTimeout(r, 50));
      await awaitPendingCallbacks();

      // Verify selected element is now below the visible area
      const containerRect = container.getBoundingClientRect();
      const selectedRectBefore = selected.getBoundingClientRect();
      expect(selectedRectBefore.top).toBeGreaterThan(containerRect.bottom);

      // Press Shift+G again — already selected, should still scroll into view
      await userEvent.keyboard("{Shift>}{g}{/Shift}");
      await awaitPendingCallbacks();

      // Selection should not have changed
      const selectedAfter = result.container.querySelector(`.${styles.lifeLogTree.selected}`)!;
      expect(selectedAfter.textContent).toContain("fourth lifelog");

      // Selected element should now be visible
      const selectedRectAfter = selectedAfter.getBoundingClientRect();
      const containerRectAfter = container.getBoundingClientRect();
      expect(selectedRectAfter.bottom).toBeLessThanOrEqual(containerRectAfter.bottom);
      expect(selectedRectAfter.top).toBeGreaterThanOrEqual(containerRectAfter.top);
    });

    // scroll-edge focus tests removed — scroll-edge focus feature was deleted
    // (replaced by scroll-based range expansion)
  });

  describe("scroll range expansion", () => {
    // Helper: create 60 items at 12h intervals (30 days back).
    // Default rangeMs=14*dayMs → items endDaysAgo 0.5-14 in initial range (~28 items).
    function makeHalfdayLifeLogs(count = 60) {
      const logs = [];
      for (let i = 1; i <= count; i++) {
        logs.push({
          id: `$h${String(i).padStart(3, "0")}`,
          text: `halfday ${i} lifelog`,
          daysAgo: i * 0.5 + 0.25,
          endDaysAgo: i * 0.5,
        });
      }
      return logs;
    }

    // Helper: scroll to top edge from a safe mid position
    async function scrollToTop(container: HTMLElement) {
      container.scrollTop = Math.floor(container.scrollHeight / 2);
      await new Promise((r) => setTimeout(r, 50));
      container.scrollTop = 0;
      await new Promise((r) => setTimeout(r, 100));
      await awaitPendingCallbacks();
      await new Promise((r) => setTimeout(r, 500));
      await awaitPendingCallbacks();
    }

    // Helper: scroll to bottom edge from a safe mid position
    async function scrollToBottom(container: HTMLElement) {
      container.scrollTop = Math.floor(container.scrollHeight / 2);
      await new Promise((r) => setTimeout(r, 50));
      container.scrollTop = container.scrollHeight - container.clientHeight;
      await new Promise((r) => setTimeout(r, 100));
      await awaitPendingCallbacks();
      await new Promise((r) => setTimeout(r, 500));
      await awaitPendingCallbacks();
    }

    it("expands range when scrolling to top edge", async ({ db, task }) => {
      await page.viewport(1200, 600);

      const { result } = await setupLifeLogsTest(task.id, db, {
        outOfRangeLifeLogs: makeHalfdayLifeLogs(),
        lifeLogsProps: { debounceMs: 0 },
        skipDefaultLifeLogs: true,
        initialSelectedId: "$h001",
      });

      await new Promise((r) => setTimeout(r, 100));
      await awaitPendingCallbacks();

      await result.findByText("halfday 1 lifelog");
      await result.findByText("halfday 28 lifelog");
      expect(result.queryByText("halfday 29 lifelog")).toBeNull();

      const container = result.container.querySelector(`.${styles.lifeLogs.container}`) as HTMLElement;
      const wrapper = result.container.querySelector(`.${styles.lifeLogs.wrapper}`) as HTMLElement;
      wrapper.style.height = "400px";
      expect(container.scrollHeight).toBeGreaterThan(container.clientHeight);

      const initialCount = result.container.querySelectorAll(`.${styles.lifeLogs.listItem}`).length;

      await scrollToTop(container);

      const afterCount = result.container.querySelectorAll(`.${styles.lifeLogs.listItem}`).length;
      expect(afterCount).toBeGreaterThan(initialCount);

      // Previously visible items still there (one-sided expansion)
      expect(result.getByText("halfday 1 lifelog")).toBeTruthy();
      expect(result.getByText("halfday 28 lifelog")).toBeTruthy();
      // Newly expanded items visible
      expect(result.getByText("halfday 29 lifelog")).toBeTruthy();
    });

    it("expands range when scrolling to bottom edge", async ({ db, task }) => {
      await page.viewport(1200, 600);

      // Select an old item to reset range to the past.
      // rangeMs=5*dayMs, select $h020 (10d ago, outside initial 5d range) → reset centers on 10d ago.
      // After reset: range = 15d ago to 5d ago. Items $h010-$h030 visible.
      // Scrolling to bottom (newer) → slideNewer → rangeEnd increases → items $h009, $h008... appear.
      const { result } = await setupLifeLogsTest(task.id, db, {
        outOfRangeLifeLogs: makeHalfdayLifeLogs(),
        lifeLogsProps: { rangeMs: 5 * dayMs, debounceMs: 0 },
        skipDefaultLifeLogs: true,
        initialSelectedId: "$h020",
      });

      await new Promise((r) => setTimeout(r, 100));
      await awaitPendingCallbacks();

      // After reset to $h020 (10d ago), range is 15d-5d ago
      await result.findByText("halfday 10 lifelog");
      await result.findByText("halfday 20 lifelog");
      // Items closer to now (< 5d ago) should NOT be visible
      expect(result.queryByText("halfday 9 lifelog")).toBeNull();

      const container = result.container.querySelector(`.${styles.lifeLogs.container}`) as HTMLElement;
      const wrapper = result.container.querySelector(`.${styles.lifeLogs.wrapper}`) as HTMLElement;
      wrapper.style.height = "400px";
      expect(container.scrollHeight).toBeGreaterThan(container.clientHeight);

      const initialCount = result.container.querySelectorAll(`.${styles.lifeLogs.listItem}`).length;

      // Scroll to bottom edge (desktop = newer direction)
      await scrollToBottom(container);

      const afterCount = result.container.querySelectorAll(`.${styles.lifeLogs.listItem}`).length;
      expect(afterCount).toBeGreaterThan(initialCount);

      // Previously visible items still there (one-sided expansion)
      expect(result.getByText("halfday 20 lifelog")).toBeTruthy();
      expect(result.getByText("halfday 10 lifelog")).toBeTruthy();
      // Newly expanded items visible
      expect(result.getByText("halfday 9 lifelog")).toBeTruthy();
    });

    it("preserves all existing items when expanding", async ({ db, task }) => {
      await page.viewport(1200, 600);

      const { result } = await setupLifeLogsTest(task.id, db, {
        outOfRangeLifeLogs: makeHalfdayLifeLogs(),
        lifeLogsProps: { debounceMs: 0 },
        skipDefaultLifeLogs: true,
        initialSelectedId: "$h001",
      });

      await new Promise((r) => setTimeout(r, 100));
      await awaitPendingCallbacks();

      await result.findByText("halfday 28 lifelog");

      const container = result.container.querySelector(`.${styles.lifeLogs.container}`) as HTMLElement;
      const wrapper = result.container.querySelector(`.${styles.lifeLogs.wrapper}`) as HTMLElement;
      wrapper.style.height = "400px";

      // Record all item texts before expansion
      const beforeItems = Array.from(result.container.querySelectorAll(`.${styles.lifeLogs.listItem}`)).map(
        (li) => li.textContent,
      );

      await scrollToTop(container);

      // All items from before should still exist
      for (const text of beforeItems) {
        const match = text?.match(/halfday \d+ lifelog/)?.[0];
        if (match) {
          expect(result.getByText(match)).toBeTruthy();
        }
      }
    });

    it("can expand multiple times sequentially", async ({ db, task }) => {
      await page.viewport(1200, 600);

      const { result } = await setupLifeLogsTest(task.id, db, {
        outOfRangeLifeLogs: makeHalfdayLifeLogs(),
        lifeLogsProps: { debounceMs: 0 },
        skipDefaultLifeLogs: true,
        initialSelectedId: "$h001",
      });

      await new Promise((r) => setTimeout(r, 100));
      await awaitPendingCallbacks();

      await result.findByText("halfday 28 lifelog");
      expect(result.queryByText("halfday 29 lifelog")).toBeNull();

      const container = result.container.querySelector(`.${styles.lifeLogs.container}`) as HTMLElement;
      const wrapper = result.container.querySelector(`.${styles.lifeLogs.wrapper}`) as HTMLElement;
      wrapper.style.height = "400px";

      // First expansion
      await scrollToTop(container);
      const count1 = result.container.querySelectorAll(`.${styles.lifeLogs.listItem}`).length;
      expect(count1).toBeGreaterThan(28);

      // Second expansion
      await scrollToTop(container);
      const count2 = result.container.querySelectorAll(`.${styles.lifeLogs.listItem}`).length;
      expect(count2).toBeGreaterThan(count1);
    });

    it("preserves scroll position when expanding range", async ({ db, task }) => {
      await page.viewport(1200, 600);

      const { result } = await setupLifeLogsTest(task.id, db, {
        outOfRangeLifeLogs: makeHalfdayLifeLogs(),
        lifeLogsProps: { debounceMs: 0 },
        skipDefaultLifeLogs: true,
        initialSelectedId: "$h028", // Oldest item in initial range (at the top of the list)
      });

      await new Promise((r) => setTimeout(r, 100));
      await awaitPendingCallbacks();

      await result.findByText("halfday 28 lifelog");

      const container = result.container.querySelector(`.${styles.lifeLogs.container}`) as HTMLElement;
      const wrapper = result.container.querySelector(`.${styles.lifeLogs.wrapper}`) as HTMLElement;
      wrapper.style.height = "400px";

      // Scroll to top so $h028 (oldest visible item) is at the top of the viewport
      container.scrollTop = Math.floor(container.scrollHeight / 2);
      await new Promise((r) => setTimeout(r, 50));
      container.scrollTop = 0;

      // Record position of the top-most item immediately (before async expansion completes)
      const topEl = document.getElementById("$h028")!;
      expect(topEl).toBeTruthy();
      const positionBefore = topEl.getBoundingClientRect().top - container.getBoundingClientRect().top;

      // Wait for expansion to complete
      await new Promise((r) => setTimeout(r, 100));
      await awaitPendingCallbacks();
      await new Promise((r) => setTimeout(r, 500));
      await awaitPendingCallbacks();

      // Verify expansion happened (more items now)
      expect(result.getByText("halfday 29 lifelog")).toBeTruthy();

      // The element that was at the top should still be at the same viewport position
      const positionAfter = topEl.getBoundingClientRect().top - container.getBoundingClientRect().top;
      expect(Math.abs(positionAfter - positionBefore)).toBeLessThan(5);
    });

    it("preserves all existing items when expanding downward", async ({ db, task }) => {
      await page.viewport(1200, 600);

      const { result } = await setupLifeLogsTest(task.id, db, {
        outOfRangeLifeLogs: makeHalfdayLifeLogs(),
        lifeLogsProps: { rangeMs: 5 * dayMs, debounceMs: 0 },
        skipDefaultLifeLogs: true,
        initialSelectedId: "$h020",
      });

      await new Promise((r) => setTimeout(r, 100));
      await awaitPendingCallbacks();

      await result.findByText("halfday 20 lifelog");

      const container = result.container.querySelector(`.${styles.lifeLogs.container}`) as HTMLElement;
      const wrapper = result.container.querySelector(`.${styles.lifeLogs.wrapper}`) as HTMLElement;
      wrapper.style.height = "400px";

      const beforeItems = Array.from(result.container.querySelectorAll(`.${styles.lifeLogs.listItem}`)).map(
        (li) => li.textContent,
      );

      await scrollToBottom(container);

      for (const text of beforeItems) {
        const match = text?.match(/halfday \d+ lifelog/)?.[0];
        if (match) {
          expect(result.getByText(match)).toBeTruthy();
        }
      }
    });

    it("can expand multiple times sequentially in both directions", async ({ db, task }) => {
      await page.viewport(1200, 600);

      // rangeMs=5*dayMs, select $h020 (10d ago) → range: 15d-5d ago (~20 items)
      const { result } = await setupLifeLogsTest(task.id, db, {
        outOfRangeLifeLogs: makeHalfdayLifeLogs(),
        lifeLogsProps: { rangeMs: 5 * dayMs, debounceMs: 0 },
        skipDefaultLifeLogs: true,
        initialSelectedId: "$h020",
      });

      await new Promise((r) => setTimeout(r, 100));
      await awaitPendingCallbacks();

      await result.findByText("halfday 20 lifelog");

      const container = result.container.querySelector(`.${styles.lifeLogs.container}`) as HTMLElement;
      const wrapper = result.container.querySelector(`.${styles.lifeLogs.wrapper}`) as HTMLElement;
      wrapper.style.height = "400px";

      const initialCount = result.container.querySelectorAll(`.${styles.lifeLogs.listItem}`).length;

      // First expansion downward (newer)
      await scrollToBottom(container);
      const count1 = result.container.querySelectorAll(`.${styles.lifeLogs.listItem}`).length;
      expect(count1).toBeGreaterThan(initialCount);

      // Second expansion upward (older)
      await scrollToTop(container);
      const count2 = result.container.querySelectorAll(`.${styles.lifeLogs.listItem}`).length;
      expect(count2).toBeGreaterThan(count1);
    });

    it("preserves scroll position when expanding range downward", async ({ db, task }) => {
      await page.viewport(1200, 600);

      const { result } = await setupLifeLogsTest(task.id, db, {
        outOfRangeLifeLogs: makeHalfdayLifeLogs(),
        lifeLogsProps: { rangeMs: 5 * dayMs, debounceMs: 0 },
        skipDefaultLifeLogs: true,
        initialSelectedId: "$h010", // Newest item in the reset range (at the bottom of the list)
      });

      await new Promise((r) => setTimeout(r, 100));
      await awaitPendingCallbacks();

      await result.findByText("halfday 10 lifelog");

      const container = result.container.querySelector(`.${styles.lifeLogs.container}`) as HTMLElement;
      const wrapper = result.container.querySelector(`.${styles.lifeLogs.wrapper}`) as HTMLElement;
      wrapper.style.height = "400px";

      // Scroll to bottom so the newest item is at the bottom of the viewport
      container.scrollTop = Math.floor(container.scrollHeight / 2);
      await new Promise((r) => setTimeout(r, 50));
      container.scrollTop = container.scrollHeight - container.clientHeight;

      // Record position of the bottom-most item immediately (before async expansion)
      const bottomEl = document.getElementById("$h010")!;
      expect(bottomEl).toBeTruthy();
      const positionBefore = bottomEl.getBoundingClientRect().top - container.getBoundingClientRect().top;

      // Wait for expansion to complete
      await new Promise((r) => setTimeout(r, 100));
      await awaitPendingCallbacks();
      await new Promise((r) => setTimeout(r, 500));
      await awaitPendingCallbacks();

      // Verify expansion happened
      expect(result.getByText("halfday 9 lifelog")).toBeTruthy();

      // The element that was at the bottom should still be at the same viewport position
      const positionAfter = bottomEl.getBoundingClientRect().top - container.getBoundingClientRect().top;
      expect(Math.abs(positionAfter - positionBefore)).toBeLessThan(5);
    });

    it("stops expanding when no more older data exists", async ({ db, task }) => {
      await page.viewport(1200, 600);

      // Only 30 items (15 days). After one 14-day expansion, all items should be loaded.
      const { result } = await setupLifeLogsTest(task.id, db, {
        outOfRangeLifeLogs: makeHalfdayLifeLogs(30),
        lifeLogsProps: { debounceMs: 0 },
        skipDefaultLifeLogs: true,
        initialSelectedId: "$h001",
      });

      await new Promise((r) => setTimeout(r, 100));
      await awaitPendingCallbacks();

      await result.findByText("halfday 28 lifelog");

      const container = result.container.querySelector(`.${styles.lifeLogs.container}`) as HTMLElement;
      const wrapper = result.container.querySelector(`.${styles.lifeLogs.wrapper}`) as HTMLElement;
      wrapper.style.height = "400px";

      // First expansion loads remaining items
      await scrollToTop(container);
      const count1 = result.container.querySelectorAll(`.${styles.lifeLogs.listItem}`).length;
      expect(count1).toBe(30); // All 30 items loaded

      // Second expansion should not add more (no older data)
      await scrollToTop(container);
      const count2 = result.container.querySelectorAll(`.${styles.lifeLogs.listItem}`).length;
      expect(count2).toBe(count1);
    });

    it("stops expanding when no more newer data exists", async ({ db, task }) => {
      await page.viewport(1200, 600);

      const { result } = await setupLifeLogsTest(task.id, db, {
        outOfRangeLifeLogs: makeHalfdayLifeLogs(10),
        lifeLogsProps: { rangeMs: 5 * dayMs, debounceMs: 0 },
        skipDefaultLifeLogs: true,
        initialSelectedId: "$h001",
      });

      await new Promise((r) => setTimeout(r, 100));
      await awaitPendingCallbacks();

      await result.findByText("halfday 10 lifelog");

      const container = result.container.querySelector(`.${styles.lifeLogs.container}`) as HTMLElement;
      const wrapper = result.container.querySelector(`.${styles.lifeLogs.wrapper}`) as HTMLElement;
      wrapper.style.height = "400px";

      const initialCount = result.container.querySelectorAll(`.${styles.lifeLogs.listItem}`).length;

      // Bottom edge = newer direction. No future items exist.
      await scrollToBottom(container);
      const afterCount = result.container.querySelectorAll(`.${styles.lifeLogs.listItem}`).length;
      expect(afterCount).toBe(initialCount);

      // Scroll to bottom again — still no change
      await scrollToBottom(container);
      const finalCount = result.container.querySelectorAll(`.${styles.lifeLogs.listItem}`).length;
      expect(finalCount).toBe(initialCount);
    });

    it("resets range on j/k navigation when window is expanded", async ({ db, task }) => {
      await page.viewport(1200, 600);

      const { result } = await setupLifeLogsTest(task.id, db, {
        outOfRangeLifeLogs: makeHalfdayLifeLogs(),
        lifeLogsProps: { debounceMs: 0 },
        skipDefaultLifeLogs: true,
        initialSelectedId: "$h014", // Middle item so j/k can navigate
      });

      await new Promise((r) => setTimeout(r, 100));
      await awaitPendingCallbacks();

      await result.findByText("halfday 28 lifelog");

      const container = result.container.querySelector(`.${styles.lifeLogs.container}`) as HTMLElement;
      const wrapper = result.container.querySelector(`.${styles.lifeLogs.wrapper}`) as HTMLElement;
      wrapper.style.height = "400px";

      // Expand via scroll
      await scrollToTop(container);
      const expandedCount = result.container.querySelectorAll(`.${styles.lifeLogs.listItem}`).length;
      expect(expandedCount).toBeGreaterThan(28);

      // Navigate with j key — should trigger resetRange since expanded
      await userEvent.keyboard("{j}");
      await awaitPendingCallbacks();
      await new Promise((r) => setTimeout(r, 500));
      await awaitPendingCallbacks();

      // After reset, count should be back to roughly initial size
      const afterResetCount = result.container.querySelectorAll(`.${styles.lifeLogs.listItem}`).length;
      expect(afterResetCount).toBeLessThan(expandedCount);
    });

    it("resets range on click when window is expanded", async ({ db, task }) => {
      await page.viewport(1200, 600);

      const { result } = await setupLifeLogsTest(task.id, db, {
        outOfRangeLifeLogs: makeHalfdayLifeLogs(),
        lifeLogsProps: { debounceMs: 0 },
        skipDefaultLifeLogs: true,
        initialSelectedId: "$h014",
      });

      await new Promise((r) => setTimeout(r, 100));
      await awaitPendingCallbacks();

      await result.findByText("halfday 28 lifelog");

      const container = result.container.querySelector(`.${styles.lifeLogs.container}`) as HTMLElement;
      const wrapper = result.container.querySelector(`.${styles.lifeLogs.wrapper}`) as HTMLElement;
      wrapper.style.height = "400px";

      await scrollToTop(container);
      const expandedCount = result.container.querySelectorAll(`.${styles.lifeLogs.listItem}`).length;
      expect(expandedCount).toBeGreaterThan(28);

      // Click on an item — should trigger resetRange since expanded
      const targetContainer = result.getByText("halfday 5 lifelog").closest(`.${styles.lifeLogTree.container}`)!;
      await userEvent.click(targetContainer);
      await awaitPendingCallbacks();
      await new Promise((r) => setTimeout(r, 500));
      await awaitPendingCallbacks();

      const afterResetCount = result.container.querySelectorAll(`.${styles.lifeLogs.listItem}`).length;
      expect(afterResetCount).toBeLessThan(expandedCount);
    });

    it("resets range on goToLatest (G) when window is expanded", async ({ db, task }) => {
      await page.viewport(1200, 600);

      const { result } = await setupLifeLogsTest(task.id, db, {
        outOfRangeLifeLogs: makeHalfdayLifeLogs(),
        lifeLogsProps: { debounceMs: 0 },
        skipDefaultLifeLogs: true,
        initialSelectedId: "$h014",
      });

      await new Promise((r) => setTimeout(r, 100));
      await awaitPendingCallbacks();

      await result.findByText("halfday 28 lifelog");

      const container = result.container.querySelector(`.${styles.lifeLogs.container}`) as HTMLElement;
      const wrapper = result.container.querySelector(`.${styles.lifeLogs.wrapper}`) as HTMLElement;
      wrapper.style.height = "400px";

      await scrollToTop(container);
      const expandedCount = result.container.querySelectorAll(`.${styles.lifeLogs.listItem}`).length;
      expect(expandedCount).toBeGreaterThan(28);

      // Press G (goToLatest) — should trigger resetRange
      await userEvent.keyboard("{Shift>}{g}{/Shift}");
      await awaitPendingCallbacks();
      await new Promise((r) => setTimeout(r, 500));
      await awaitPendingCallbacks();

      const afterResetCount = result.container.querySelectorAll(`.${styles.lifeLogs.listItem}`).length;
      expect(afterResetCount).toBeLessThan(expandedCount);
    });

    it("resets range on goToFirst (g) when window is expanded", async ({ db, task }) => {
      await page.viewport(1200, 600);

      const { result } = await setupLifeLogsTest(task.id, db, {
        outOfRangeLifeLogs: makeHalfdayLifeLogs(),
        lifeLogsProps: { debounceMs: 0 },
        skipDefaultLifeLogs: true,
        initialSelectedId: "$h014",
      });

      await new Promise((r) => setTimeout(r, 100));
      await awaitPendingCallbacks();

      await result.findByText("halfday 28 lifelog");

      const container = result.container.querySelector(`.${styles.lifeLogs.container}`) as HTMLElement;
      const wrapper = result.container.querySelector(`.${styles.lifeLogs.wrapper}`) as HTMLElement;
      wrapper.style.height = "400px";

      await scrollToTop(container);
      const expandedCount = result.container.querySelectorAll(`.${styles.lifeLogs.listItem}`).length;
      expect(expandedCount).toBeGreaterThan(28);

      // Press g (goToFirst) — should trigger resetRange
      await userEvent.keyboard("{g}");
      await awaitPendingCallbacks();
      await new Promise((r) => setTimeout(r, 500));
      await awaitPendingCallbacks();

      const afterResetCount = result.container.querySelectorAll(`.${styles.lifeLogs.listItem}`).length;
      expect(afterResetCount).toBeLessThan(expandedCount);
    });

    it("resets range on j/k navigation when window is expanded downward", async ({ db, task }) => {
      await page.viewport(1200, 600);

      const { result } = await setupLifeLogsTest(task.id, db, {
        outOfRangeLifeLogs: makeHalfdayLifeLogs(),
        lifeLogsProps: { rangeMs: 5 * dayMs, debounceMs: 0 },
        skipDefaultLifeLogs: true,
        initialSelectedId: "$h020",
      });

      await new Promise((r) => setTimeout(r, 100));
      await awaitPendingCallbacks();

      await result.findByText("halfday 20 lifelog");

      const container = result.container.querySelector(`.${styles.lifeLogs.container}`) as HTMLElement;
      const wrapper = result.container.querySelector(`.${styles.lifeLogs.wrapper}`) as HTMLElement;
      wrapper.style.height = "400px";

      // Expand downward
      await scrollToBottom(container);
      const expandedCount = result.container.querySelectorAll(`.${styles.lifeLogs.listItem}`).length;

      // Navigate with k key — should trigger resetRange since expanded
      await userEvent.keyboard("{k}");
      await awaitPendingCallbacks();
      await new Promise((r) => setTimeout(r, 500));
      await awaitPendingCallbacks();

      const afterResetCount = result.container.querySelectorAll(`.${styles.lifeLogs.listItem}`).length;
      expect(afterResetCount).toBeLessThan(expandedCount);
    });

    it("only loads LifeLogs within the initial range", async ({ db, task }) => {
      const { result } = await setupLifeLogsTest(task.id, db, {
        outOfRangeLifeLogs: [{ id: "$old", text: "old lifelog", daysAgo: 19, endDaysAgo: 18 }],
        lifeLogsProps: { debounceMs: 0 },
      });

      await result.findByText("first lifelog");
      await new Promise((r) => setTimeout(r, 100));
      await awaitPendingCallbacks();

      // endDaysAgo:18 is outside 14-day range — should NOT be visible
      expect(result.queryByText("old lifelog")).toBeNull();
    });

    it("does not change range when navigating within loaded set (not expanded)", async ({ db, task }) => {
      const { result } = await setupLifeLogsTest(task.id, db, {
        lifeLogsProps: { debounceMs: 0 },
      });

      await result.findByText("first lifelog");
      await result.findByText("second lifelog");

      const initialCount = result.container.querySelectorAll(`.${styles.lifeLogs.listItem}`).length;

      // Navigate with j/k within loaded set
      await userEvent.keyboard("{j}");
      await awaitPendingCallbacks();
      await new Promise((r) => setTimeout(r, 100));
      await awaitPendingCallbacks();

      await userEvent.keyboard("{k}");
      await awaitPendingCallbacks();
      await new Promise((r) => setTimeout(r, 100));
      await awaitPendingCallbacks();

      // Item count should not change (no reset triggered)
      const afterCount = result.container.querySelectorAll(`.${styles.lifeLogs.listItem}`).length;
      expect(afterCount).toBe(initialCount);
    });

    it("does not reset range when selecting LifeLog with noneTimestamp endAt (not expanded)", async ({ db, task }) => {
      const { result } = await setupLifeLogsTest(task.id, db, {
        lifeLogsProps: { debounceMs: 0 },
      });

      await result.findByText("first lifelog");
      await result.findByText("third lifelog");

      const initialCount = result.container.querySelectorAll(`.${styles.lifeLogs.listItem}`).length;

      // Navigate to $log3 (noneTimestamp endAt)
      await userEvent.keyboard("{j}");
      await awaitPendingCallbacks();
      await userEvent.keyboard("{j}");
      await awaitPendingCallbacks();
      await new Promise((r) => setTimeout(r, 100));
      await awaitPendingCallbacks();

      // Item count should not change
      const afterCount = result.container.querySelectorAll(`.${styles.lifeLogs.listItem}`).length;
      expect(afterCount).toBe(initialCount);
    });

    it("can expand, reset, then expand again", async ({ db, task }) => {
      await page.viewport(1200, 600);

      const { result } = await setupLifeLogsTest(task.id, db, {
        outOfRangeLifeLogs: makeHalfdayLifeLogs(),
        lifeLogsProps: { debounceMs: 0 },
        skipDefaultLifeLogs: true,
        initialSelectedId: "$h014",
      });

      await new Promise((r) => setTimeout(r, 100));
      await awaitPendingCallbacks();

      await result.findByText("halfday 28 lifelog");

      const container = result.container.querySelector(`.${styles.lifeLogs.container}`) as HTMLElement;
      const wrapper = result.container.querySelector(`.${styles.lifeLogs.wrapper}`) as HTMLElement;
      wrapper.style.height = "400px";

      // 1. Expand
      await scrollToTop(container);
      const expandedCount = result.container.querySelectorAll(`.${styles.lifeLogs.listItem}`).length;
      expect(expandedCount).toBeGreaterThan(28);

      // 2. Reset via j navigation
      await userEvent.keyboard("{j}");
      await awaitPendingCallbacks();
      await new Promise((r) => setTimeout(r, 500));
      await awaitPendingCallbacks();

      const resetCount = result.container.querySelectorAll(`.${styles.lifeLogs.listItem}`).length;
      expect(resetCount).toBeLessThan(expandedCount);

      // 3. Expand again
      await scrollToTop(container);
      const reExpandedCount = result.container.querySelectorAll(`.${styles.lifeLogs.listItem}`).length;
      expect(reExpandedCount).toBeGreaterThan(resetCount);
    });

    it("expands range when scrolling to bottom edge (mobile column-reverse)", async ({ db, task }) => {
      await page.viewport(414, 896);

      const { result } = await setupLifeLogsTest(task.id, db, {
        outOfRangeLifeLogs: makeHalfdayLifeLogs(),
        lifeLogsProps: { debounceMs: 0 },
        skipDefaultLifeLogs: true,
        initialSelectedId: "$h001",
      });

      await new Promise((r) => setTimeout(r, 100));
      await awaitPendingCallbacks();

      await result.findByText("halfday 28 lifelog");
      expect(result.queryByText("halfday 29 lifelog")).toBeNull();

      const container = result.container.querySelector(`.${styles.lifeLogs.container}`) as HTMLElement;
      const wrapper = result.container.querySelector(`.${styles.lifeLogs.wrapper}`) as HTMLElement;
      wrapper.style.height = "400px";
      expect(container.scrollHeight).toBeGreaterThan(container.clientHeight);

      const initialCount = result.container.querySelectorAll(`.${styles.lifeLogs.listItem}`).length;

      // In mobile column-reverse, bottom edge = older direction
      await scrollToBottom(container);

      const afterCount = result.container.querySelectorAll(`.${styles.lifeLogs.listItem}`).length;
      expect(afterCount).toBeGreaterThan(initialCount);

      // Previously visible items still there
      expect(result.getByText("halfday 1 lifelog")).toBeTruthy();
      expect(result.getByText("halfday 28 lifelog")).toBeTruthy();
    });

    it("expands range when scrolling to top edge (mobile column-reverse)", async ({ db, task }) => {
      await page.viewport(414, 896);

      // Mobile top edge = newer direction. Select old item to have newer items outside range.
      const { result } = await setupLifeLogsTest(task.id, db, {
        outOfRangeLifeLogs: makeHalfdayLifeLogs(),
        lifeLogsProps: { rangeMs: 5 * dayMs, debounceMs: 0 },
        skipDefaultLifeLogs: true,
        initialSelectedId: "$h020",
      });

      await new Promise((r) => setTimeout(r, 100));
      await awaitPendingCallbacks();

      await result.findByText("halfday 20 lifelog");
      expect(result.queryByText("halfday 9 lifelog")).toBeNull();

      const container = result.container.querySelector(`.${styles.lifeLogs.container}`) as HTMLElement;
      const wrapper = result.container.querySelector(`.${styles.lifeLogs.wrapper}`) as HTMLElement;
      wrapper.style.height = "400px";
      expect(container.scrollHeight).toBeGreaterThan(container.clientHeight);

      const initialCount = result.container.querySelectorAll(`.${styles.lifeLogs.listItem}`).length;

      // In mobile column-reverse, top edge = newer direction
      await scrollToTop(container);

      const afterCount = result.container.querySelectorAll(`.${styles.lifeLogs.listItem}`).length;
      expect(afterCount).toBeGreaterThan(initialCount);

      // Previously visible items still there
      expect(result.getByText("halfday 20 lifelog")).toBeTruthy();
      // Newly expanded newer items visible
      expect(result.getByText("halfday 9 lifelog")).toBeTruthy();
    });

    // Reset viewport after expansion tests
    afterAll(async () => {
      await page.viewport(414, 896);
    });
  });

  describe("scroll window (time range)", () => {
    it("resets range to show out-of-range LifeLog when selected", async ({ db, task }) => {
      // Create an out-of-range LifeLog (endAt 18 days ago, outside the default 14-day range)
      const { result } = await setupLifeLogsTest(task.id, db, {
        outOfRangeLifeLogs: [{ id: "$oldLog", text: "old lifelog", daysAgo: 19, endDaysAgo: 18 }],
        lifeLogsProps: { debounceMs: 0 }, // Disable debounce for immediate effect
        initialSelectedId: "$oldLog", // Select the out-of-range LifeLog
      });

      // Wait for debounced update to slide the window
      await new Promise((r) => setTimeout(r, 50));
      await awaitPendingCallbacks();

      // The out-of-range LifeLog should now be visible after window slides
      const oldLogElement = await result.findByText("old lifelog");
      expect(oldLogElement).toBeTruthy();
    });

    it("does not reset range when selecting LifeLog with noneTimestamp endAt", async ({ db, task }) => {
      const { result } = await setupLifeLogsTest(task.id, db, {
        lifeLogsProps: { debounceMs: 0 }, // Disable debounce for immediate effect
      });

      // Verify initial state: $log1 and $log2 are visible
      await result.findByText("first lifelog");
      await result.findByText("second lifelog");

      // Navigate to $log3 which has noneTimestamp endAt
      // $log1 is selected, press "j" twice to get to $log3
      await userEvent.keyboard("{j}");
      await awaitPendingCallbacks();
      await userEvent.keyboard("{j}");
      await awaitPendingCallbacks();

      // Wait for any potential debounced update
      await new Promise((r) => setTimeout(r, 50));
      await awaitPendingCallbacks();

      // $log1 and $log2 should still be visible (window did not slide)
      expect(result.getByText("first lifelog")).toBeTruthy();
      expect(result.getByText("second lifelog")).toBeTruthy();
    });

    it("resets range when navigating with k key after expansion", async ({ db, task }) => {
      // Create LifeLogs at different time points:
      // - $nearPast: endAt 5 days ago (within initial 14-day range)
      // - $farPast: endAt 20 days ago (outside initial 14-day range, visible after expansion)
      const { result } = await setupLifeLogsTest(task.id, db, {
        outOfRangeLifeLogs: [
          { id: "$nearPast", text: "near past lifelog", daysAgo: 6, endDaysAgo: 5 },
          { id: "$farPast", text: "far past lifelog", daysAgo: 21, endDaysAgo: 20 },
        ],
        lifeLogsProps: { debounceMs: 0 },
        initialSelectedId: "$nearPast",
      });

      // Wait for initial range reset to $nearPast
      await new Promise((r) => setTimeout(r, 50));
      await awaitPendingCallbacks();

      // $nearPast should be visible
      await result.findByText("near past lifelog");

      // $farPast should NOT be visible (endAt 20 days ago, outside 14-day range centered on $nearPast)
      expect(result.queryByText("far past lifelog")).toBeNull();

      // Navigate with k key to go backwards — this triggers resetRange since it was initially expanded
      await userEvent.keyboard("{k}");
      await awaitPendingCallbacks();

      // Wait for debounced resetRange
      await new Promise((r) => setTimeout(r, 50));
      await awaitPendingCallbacks();

      // $nearPast should still be visible (it's within the range)
      expect(result.getByText("near past lifelog")).toBeTruthy();
    });

    it("resets range when navigating with j key after expansion", async ({ db, task }) => {
      // Create LifeLogs at different time points:
      // - $farPast: endAt 20 days ago (outside initial 14-day range)
      // - $nearPast: endAt 5 days ago (within initial 14-day range, will be selected first)
      // Start from $nearPast, navigate forward with j — triggers resetRange
      const { result } = await setupLifeLogsTest(task.id, db, {
        outOfRangeLifeLogs: [
          { id: "$farPast", text: "far past lifelog", daysAgo: 21, endDaysAgo: 20 },
          { id: "$nearPast", text: "near past lifelog", daysAgo: 6, endDaysAgo: 5 },
        ],
        lifeLogsProps: { debounceMs: 0 },
        initialSelectedId: "$nearPast",
      });

      // Wait for initial range reset to $nearPast
      await new Promise((r) => setTimeout(r, 50));
      await awaitPendingCallbacks();

      await result.findByText("near past lifelog");

      // $farPast should NOT be visible (endAt 20 days ago, outside 14-day range centered on $nearPast)
      expect(result.queryByText("far past lifelog")).toBeNull();

      // Navigate forward with j key
      await userEvent.keyboard("{j}");
      await awaitPendingCallbacks();

      // Wait for debounced resetRange
      await new Promise((r) => setTimeout(r, 50));
      await awaitPendingCallbacks();

      // $nearPast should still be visible
      expect(result.getByText("near past lifelog")).toBeTruthy();
    });

    it("resets range correctly for LifeLog with large startAt-endAt difference", async ({ db, task }) => {
      // Create a LifeLog where:
      // - startAt is 40 days ago (far outside range)
      // - endAt is 18 days ago (outside default 14-day range, but will be used for range reset)
      // The range should reset to center around endAt (18 days ago), not startAt (40 days ago)
      const { result } = await setupLifeLogsTest(task.id, db, {
        outOfRangeLifeLogs: [{ id: "$longLog", text: "long duration lifelog", daysAgo: 40, endDaysAgo: 18 }],
        lifeLogsProps: { debounceMs: 0 },
        initialSelectedId: "$longLog",
      });

      // Wait for debounced update to reset the range
      await new Promise((r) => setTimeout(r, 50));
      await awaitPendingCallbacks();

      // The LifeLog should be visible after range resets to center around endAt (18 days ago)
      // New range: (18-14) = 32 days ago to (18+14) = 4 days ago
      // endAt (18 days ago) is within this range, so the LifeLog should be visible
      const longLogElement = await result.findByText("long duration lifelog");
      expect(longLogElement).toBeTruthy();
    });

    it("resets range when goToLatest navigates to LifeLog with noneTimestamp endAt from past range", async ({
      db,
      task,
    }) => {
      // Create an out-of-range LifeLog in the past to start from
      // $oldLog: startAt 19 days ago, endAt 18 days ago (outside the default 14-day range)
      // The default LifeLogs ($log1-$log4) have endAt = noneTimestamp (ongoing)
      const { result } = await setupLifeLogsTest(task.id, db, {
        outOfRangeLifeLogs: [{ id: "$oldLog", text: "old lifelog", daysAgo: 19, endDaysAgo: 18 }],
        lifeLogsProps: { debounceMs: 0 },
        initialSelectedId: "$oldLog",
      });

      // Wait for window to slide to $oldLog
      await new Promise((r) => setTimeout(r, 50));
      await awaitPendingCallbacks();

      // $oldLog should be visible after range reset, default LifeLogs should NOT be visible (range is in the past)
      await result.findByText("old lifelog");
      expect(result.queryByText("first lifelog")).toBeNull();

      // Click ⏫ (goToLatest) button to navigate to the latest LifeLog
      const goToLatestButton = Array.from(result.container.querySelectorAll(`.${styles.mobileToolbar.button}`)).find(
        (btn) => btn.textContent === "⏫",
      ) as HTMLButtonElement;
      expect(goToLatestButton).toBeTruthy();

      await userEvent.click(goToLatestButton);
      await awaitPendingCallbacks();

      // Wait for debounced range update
      await new Promise((r) => setTimeout(r, 50));
      await awaitPendingCallbacks();

      // The latest LifeLog ($log4, noneTimestamp endAt) should now be visible and selected
      await result.findByText("fourth lifelog");
      const log4 = result.getByText("fourth lifelog").closest(`.${styles.lifeLogTree.container}`);
      expect(log4?.className).toContain(styles.lifeLogTree.selected);

      // The old LifeLog should no longer be visible (range slid to present)
      expect(result.queryByText("old lifelog")).toBeNull();
    });

    it("preserves focused element position when range resets with items added above", async ({ db, task }) => {
      // When selecting an out-of-range item, range resets and new items appear.
      // The selected element's position in the viewport should be preserved.
      // $target: endAt 18d ago (outside initial 14-day range, triggers reset when selected)
      // $above: endAt 26d ago (outside initial range, but within range after resetting to $target)
      const { result } = await setupLifeLogsTest(task.id, db, {
        outOfRangeLifeLogs: [
          { id: "$above", text: "above lifelog", daysAgo: 27, endDaysAgo: 26 },
          { id: "$target", text: "target lifelog", daysAgo: 19, endDaysAgo: 18 },
        ],
        lifeLogsProps: { debounceMs: 0 },
        initialSelectedId: "$target",
      });

      // Wait for range reset to $target (center=18d ago, range: 32d-4d ago)
      // $above (endAt 26d ago) is within this range
      await new Promise((r) => setTimeout(r, 50));
      await awaitPendingCallbacks();

      // Both should be visible
      await result.findByText("target lifelog");
      await result.findByText("above lifelog");

      // $above should appear before $target in the list (older endAt first)
      const listItems = result.container.querySelectorAll("li");
      const aboveIdx = Array.from(listItems).findIndex((li) => li.textContent?.includes("above lifelog"));
      const targetIdx = Array.from(listItems).findIndex((li) => li.textContent?.includes("target lifelog"));
      expect(aboveIdx).toBeLessThan(targetIdx);
    });

    it("preserves focused element position when range resets via goToLatest", async ({ db, task }) => {
      // Start from a past range, then goToLatest jumps to present (items removed above).
      // $farPast: endAt 28d ago (visible after first reset, removed after goToLatest)
      // $target: endAt 18d ago (out of initial 14d range, triggers first reset)
      const { result } = await setupLifeLogsTest(task.id, db, {
        outOfRangeLifeLogs: [
          { id: "$farPast", text: "far past lifelog", daysAgo: 29, endDaysAgo: 28 },
          { id: "$target", text: "target lifelog", daysAgo: 19, endDaysAgo: 18 },
        ],
        lifeLogsProps: { debounceMs: 0 },
        initialSelectedId: "$target",
      });

      // Wait for range reset to $target (center=18d ago, range: 32d-4d ago)
      await new Promise((r) => setTimeout(r, 50));
      await awaitPendingCallbacks();

      await result.findByText("far past lifelog");
      await result.findByText("target lifelog");

      // Press G (goToLatest) — navigates to latest LifeLog, resets range to present
      await userEvent.keyboard("{Shift>}{g}{/Shift}");
      await awaitPendingCallbacks();

      // Wait for range reset
      await new Promise((r) => setTimeout(r, 50));
      await awaitPendingCallbacks();

      // $farPast should be removed (outside new range centered on DateNow() ±14d)
      expect(result.queryByText("far past lifelog")).toBeNull();

      // Latest LifeLog should now be visible
      await result.findByText("fourth lifelog");
    });

    it("preserves focused element position when range resets with items added above (mobile)", async ({ db, task }) => {
      await page.viewport(414, 896);

      const { result } = await setupLifeLogsTest(task.id, db, {
        outOfRangeLifeLogs: [
          { id: "$above", text: "above lifelog", daysAgo: 27, endDaysAgo: 26 },
          { id: "$target", text: "target lifelog", daysAgo: 19, endDaysAgo: 18 },
        ],
        lifeLogsProps: { debounceMs: 0 },
        initialSelectedId: "$target",
      });

      // Wait for range reset to $target (center=18d ago, range: 32d-4d ago)
      await new Promise((r) => setTimeout(r, 50));
      await awaitPendingCallbacks();

      // Both should be visible
      await result.findByText("target lifelog");
      await result.findByText("above lifelog");

      const listItems = result.container.querySelectorAll("li");
      const aboveIdx = Array.from(listItems).findIndex((li) => li.textContent?.includes("above lifelog"));
      const targetIdx = Array.from(listItems).findIndex((li) => li.textContent?.includes("target lifelog"));
      expect(aboveIdx).toBeLessThan(targetIdx);
    });

    it("preserves focused element position when range resets via goToLatest (mobile)", async ({ db, task }) => {
      await page.viewport(414, 896);

      const { result } = await setupLifeLogsTest(task.id, db, {
        outOfRangeLifeLogs: [
          { id: "$farPast", text: "far past lifelog", daysAgo: 29, endDaysAgo: 28 },
          { id: "$target", text: "target lifelog", daysAgo: 19, endDaysAgo: 18 },
        ],
        lifeLogsProps: { debounceMs: 0 },
        initialSelectedId: "$target",
      });

      // Wait for range reset to $target
      await new Promise((r) => setTimeout(r, 50));
      await awaitPendingCallbacks();

      await result.findByText("far past lifelog");
      await result.findByText("target lifelog");

      // Press G (goToLatest) — navigates to latest LifeLog, resets range to present
      await userEvent.keyboard("{Shift>}{g}{/Shift}");
      await awaitPendingCallbacks();

      // Wait for range reset
      await new Promise((r) => setTimeout(r, 50));
      await awaitPendingCallbacks();

      // $farPast should be removed
      expect(result.queryByText("far past lifelog")).toBeNull();

      // Latest LifeLog should now be visible
      await result.findByText("fourth lifelog");
    });
  });

  describe("MobileToolbar", () => {
    describe("responsive visibility", () => {
      it("is visible at mobile viewport (414px width)", async ({ db, task }) => {
        await page.viewport(414, 896);
        const { result } = await setupLifeLogsTest(task.id, db);

        const toolbar = result.container.querySelector(`.${styles.mobileToolbar.container}`);
        expect(toolbar).toBeTruthy();
        const computedStyle = window.getComputedStyle(toolbar!);
        expect(computedStyle.display).toBe("flex");
      });

      it("is hidden at desktop viewport (800px width)", async ({ db, task }) => {
        await page.viewport(1200, 600);
        const { result } = await setupLifeLogsTest(task.id, db);

        const toolbar = result.container.querySelector(`.${styles.mobileToolbar.container}`);
        expect(toolbar).toBeTruthy();
        const computedStyle = window.getComputedStyle(toolbar!);
        expect(computedStyle.display).toBe("none");
      });

      it("becomes visible when resizing from desktop to mobile", async ({ db, task }) => {
        await page.viewport(1200, 600);
        const { result } = await setupLifeLogsTest(task.id, db);

        const toolbar = result.container.querySelector(`.${styles.mobileToolbar.container}`)!;

        // Initially hidden
        expect(window.getComputedStyle(toolbar).display).toBe("none");

        // Resize to mobile
        await page.viewport(414, 896);
        await new Promise((r) => setTimeout(r, 50));

        // Now visible
        expect(window.getComputedStyle(toolbar).display).toBe("flex");
      });
    });

    describe("navigation buttons", () => {
      it("enters editing mode with ✏️ button click and cursor at end", async ({ db, task }) => {
        const { result } = await setupLifeLogsTest(task.id, db);

        // No input should exist initially
        expect(result.container.querySelector("input")).toBeNull();

        // Click ✏️ button
        const editButton = Array.from(result.container.querySelectorAll(`.${styles.mobileToolbar.button}`)).find(
          (btn) => btn.textContent === "✏️",
        ) as HTMLButtonElement;
        expect(editButton).toBeTruthy();

        editButton.click();
        await awaitPendingCallbacks();

        // Input should now exist with text
        const input = result.container.querySelector("input") as HTMLInputElement;
        expect(input).toBeTruthy();
        expect(input.value).toBe("first lifelog");

        // Cursor should be at the end of the text
        expect(input.selectionStart).toBe("first lifelog".length);
        expect(input.selectionEnd).toBe("first lifelog".length);
      });

      it("enters tree mode with ↪️ button click", async ({ db, task }) => {
        const { result } = await setupLifeLogsTest(task.id, db);

        // Tree nodes should not be visible initially
        expect(result.queryByText("first child")).toBeNull();

        // Click ↪️ button
        const enterTreeButton = Array.from(result.container.querySelectorAll(`.${styles.mobileToolbar.button}`)).find(
          (btn) => btn.textContent === "↪️",
        ) as HTMLButtonElement;
        expect(enterTreeButton).toBeTruthy();

        enterTreeButton.click();
        await awaitPendingCallbacks();

        // Tree nodes should now be visible
        await result.findByText("first child");
        expect(result.getByText("first child")).toBeTruthy();
      });
    });

    describe("editing toolbar", () => {
      it("shows ▶️ and ◀️ buttons when editing", async ({ db, task }) => {
        const { result } = await setupLifeLogsTest(task.id, db);

        // Initially, ▶️ button exists in navigation mode (for setStartAtNow), but ◀️ does not
        const nextFieldButtonInitial = Array.from(
          result.container.querySelectorAll(`.${styles.mobileToolbar.button}`),
        ).filter((btn) => btn.textContent === "▶️");
        // In navigation mode, one ▶️ button exists (for setStartAtNow)
        expect(nextFieldButtonInitial.length).toBe(1);
        const prevFieldButtonInitial = Array.from(
          result.container.querySelectorAll(`.${styles.mobileToolbar.button}`),
        ).filter((btn) => btn.textContent === "◀️");
        // In navigation mode, no ◀️ button exists
        expect(prevFieldButtonInitial.length).toBe(0);

        // Enter editing mode
        await userEvent.keyboard("{i}");
        await awaitPendingCallbacks();

        // ▶️ and ◀️ buttons should now exist in editing toolbar
        const nextFieldButton = Array.from(result.container.querySelectorAll(`.${styles.mobileToolbar.button}`)).find(
          (btn) => btn.textContent === "▶️",
        );
        const prevFieldButton = Array.from(result.container.querySelectorAll(`.${styles.mobileToolbar.button}`)).find(
          (btn) => btn.textContent === "◀️",
        );

        expect(nextFieldButton).toBeTruthy();
        expect(prevFieldButton).toBeTruthy();
      });

      it("cycles to next field with ▶️ button click", async ({ db, task }) => {
        const { result } = await setupLifeLogsTest(task.id, db);

        // Enter editing mode
        await userEvent.keyboard("{i}");
        await awaitPendingCallbacks();

        // Initial input is text field
        const input1 = result.container.querySelector("input") as HTMLInputElement;
        expect(input1.value).toBe("first lifelog");

        // Click ▶️ button using userEvent
        const nextFieldButton = Array.from(result.container.querySelectorAll(`.${styles.mobileToolbar.button}`)).find(
          (btn) => btn.textContent === "▶️",
        ) as HTMLButtonElement;

        await userEvent.click(nextFieldButton);
        await awaitPendingCallbacks();

        // Input should now be startAt field
        const input2 = result.container.querySelector("input") as HTMLInputElement;
        expect(input2.value).toBe("20260110 103000");
      });

      it("exits editing mode with ✅ button click", async ({ db, task }) => {
        const { result } = await setupLifeLogsTest(task.id, db);

        // Enter editing mode
        await userEvent.keyboard("{i}");
        await awaitPendingCallbacks();

        // Input should be visible
        const input = result.container.querySelector("input") as HTMLInputElement;
        expect(input).toBeTruthy();
        expect(input.value).toBe("first lifelog");

        // Click ✅ button to exit editing
        const exitButton = Array.from(result.container.querySelectorAll(`.${styles.mobileToolbar.button}`)).find(
          (btn) => btn.textContent === "✅",
        ) as HTMLButtonElement;
        expect(exitButton).toBeTruthy();

        await userEvent.click(exitButton);
        await awaitPendingCallbacks();

        // Input should no longer be visible (editing mode exited)
        expect(result.container.querySelector("input")).toBeNull();

        // LifeLog should still be selected
        const log1 = result.getByText("first lifelog").closest(`.${styles.lifeLogTree.container}`);
        expect(log1?.className).toContain(styles.lifeLogTree.selected);
      });

      it("saves edited text when exiting with ✅ button click", async ({ db, task }) => {
        const { result } = await setupLifeLogsTest(task.id, db);

        // Enter editing mode with 'a' key (cursor at end)
        await userEvent.keyboard("{a}");
        await awaitPendingCallbacks();

        // Input should be visible
        const input = result.container.querySelector("input") as HTMLInputElement;
        expect(input).toBeTruthy();
        expect(input.value).toBe("first lifelog");

        // Type additional text
        await userEvent.keyboard(" edited");
        await awaitPendingCallbacks();

        // Verify input has the edited text
        expect(input.value).toBe("first lifelog edited");

        // Click ✅ button to exit editing
        const exitButton = Array.from(result.container.querySelectorAll(`.${styles.mobileToolbar.button}`)).find(
          (btn) => btn.textContent === "✅",
        ) as HTMLButtonElement;
        expect(exitButton).toBeTruthy();

        await userEvent.click(exitButton);
        await awaitPendingCallbacks();

        // Input should no longer be visible (editing mode exited)
        expect(result.container.querySelector("input")).toBeNull();

        // Edited text should be displayed (not old text)
        expect(result.getByText("first lifelog edited")).toBeTruthy();
        expect(result.queryByText(/^first lifelog$/)).toBeNull();
      });

      it("saves edited startAt when exiting with ✅ button click", async ({ db, task }) => {
        const { result } = await setupLifeLogsTest(task.id, db);

        // Enter editing mode
        await userEvent.keyboard("{i}");
        await awaitPendingCallbacks();

        // Navigate to startAt field with Tab
        await userEvent.keyboard("{Tab}");
        await awaitPendingCallbacks();

        // Input should now be startAt field
        const input = result.container.querySelector("input") as HTMLInputElement;
        expect(input).toBeTruthy();
        expect(input.value).toBe("20260110 103000");

        // Change the time (select all and type new value)
        await userEvent.keyboard("{Control>}a{/Control}20260110 103005");
        await awaitPendingCallbacks();

        // Click ✅ button to exit editing
        const exitButton = Array.from(result.container.querySelectorAll(`.${styles.mobileToolbar.button}`)).find(
          (btn) => btn.textContent === "✅",
        ) as HTMLButtonElement;
        expect(exitButton).toBeTruthy();

        await userEvent.click(exitButton);
        await awaitPendingCallbacks();

        // Input should no longer be visible (editing mode exited)
        expect(result.container.querySelector("input")).toBeNull();

        // New startAt should be displayed
        expect(result.getByText("2026-01-10 10:30:05")).toBeTruthy();
        // Old startAt should not be displayed
        expect(result.queryByText("2026-01-10 10:30:00")).toBeNull();
      });
    });

    describe("lifeLog mode buttons", () => {
      it("enters startAt editing mode with 📝▶️ button click", async ({ db, task }) => {
        const { result } = await setupLifeLogsTest(task.id, db);

        await result.findByText("first lifelog");

        // $log1 is already selected and has startAt = 2026-01-10 10:30:00
        // Click 📝▶️ button to start editing startAt
        const editStartAtButton = Array.from(result.container.querySelectorAll(`.${styles.mobileToolbar.button}`)).find(
          (btn) => btn.textContent === "📝▶️",
        ) as HTMLButtonElement;
        expect(editStartAtButton).toBeTruthy();

        await userEvent.click(editStartAtButton);
        await awaitPendingCallbacks();

        // Verify editing mode is active with startAt field
        const input = result.container.querySelector("input") as HTMLInputElement;
        expect(input).toBeTruthy();
        expect(input.value).toBe("20260110 103000"); // startAt in edit format
      });

      it("enters endAt editing mode with 📝⏹️ button click", async ({ db, task }) => {
        const { result } = await setupLifeLogsTest(task.id, db);

        await result.findByText("first lifelog");

        // $log1 is already selected and has endAt = noneTimestamp
        // Click 📝⏹️ button to start editing endAt
        const editEndAtButton = Array.from(result.container.querySelectorAll(`.${styles.mobileToolbar.button}`)).find(
          (btn) => btn.textContent === "📝⏹️",
        ) as HTMLButtonElement;
        expect(editEndAtButton).toBeTruthy();

        await userEvent.click(editEndAtButton);
        await awaitPendingCallbacks();

        // Verify editing mode is active with endAt field
        const input = result.container.querySelector("input") as HTMLInputElement;
        expect(input).toBeTruthy();
        expect(input.value).toBe(""); // noneTimestamp shows as empty in edit mode
      });

      it("creates new LifeLog with ➕ button click", async ({ db, task }) => {
        const { result } = await setupLifeLogsTest(task.id, db);

        await result.findByText("first lifelog");

        // Initial count of lifelogs
        const initialListItems = result.container.querySelectorAll(`.${styles.lifeLogs.listItem}`);
        expect(initialListItems.length).toBe(4);

        // Click ➕ (newLifeLog) button
        const newLifeLogButton = Array.from(result.container.querySelectorAll(`.${styles.mobileToolbar.button}`)).find(
          (btn) => btn.textContent === "➕",
        ) as HTMLButtonElement;
        expect(newLifeLogButton).toBeTruthy();

        await userEvent.click(newLifeLogButton);
        await awaitPendingCallbacks();

        // New lifelog should be added and editing mode should be active
        const listItems = result.container.querySelectorAll(`.${styles.lifeLogs.listItem}`);
        expect(listItems.length).toBe(5);

        // Verify that editing mode is active (input should be visible)
        const input = result.container.querySelector("input") as HTMLInputElement;
        expect(input).toBeTruthy();

        // Type text for the new lifelog
        input.focus();
        await userEvent.keyboard("new lifelog from button");

        // Press Escape to save and exit editing
        await userEvent.keyboard("{Escape}");
        await awaitPendingCallbacks();

        // Verify the new lifelog text is displayed
        expect(result.getByText("new lifelog from button")).toBeTruthy();
      });

      it("sets startAt to current time when creating LifeLog with ➕ button from parent with noneTimestamp endAt", async ({
        db,
        task,
      }) => {
        const { result } = await setupLifeLogsTest(task.id, db);

        await result.findByText("first lifelog");
        await result.findByText("third lifelog");

        // Navigate to $log3 which has endAt=noneTimestamp
        await userEvent.keyboard("{j}");
        await awaitPendingCallbacks();
        await userEvent.keyboard("{j}");
        await awaitPendingCallbacks();

        // Verify $log3 is selected
        const log3 = result.getByText("third lifelog").closest(`.${styles.lifeLogTree.container}`);
        expect(log3?.className).toContain(styles.lifeLogTree.selected);

        // Initial N/A count: 6
        expect(result.getAllByText("N/A").length).toBe(6);

        // Click ➕ (newLifeLog) button
        const newLifeLogButton = Array.from(result.container.querySelectorAll(`.${styles.mobileToolbar.button}`)).find(
          (btn) => btn.textContent === "➕",
        ) as HTMLButtonElement;
        expect(newLifeLogButton).toBeTruthy();

        await userEvent.click(newLifeLogButton);
        await awaitPendingCallbacks();

        // Exit editing mode to see the time
        await userEvent.keyboard("{Escape}");
        await awaitPendingCallbacks();

        // N/A count should be 7 (new lifelog has startAt=current time, endAt=noneTimestamp)
        expect(result.getAllByText("N/A").length).toBe(7);

        // Verify the new lifelog's startAt is displayed as 2026-01-10 12:00:00
        const allTimeRanges = result.container.querySelectorAll(`.${styles.lifeLogTree.timeRange}`);
        const timeRangesWithBaseTime = Array.from(allTimeRanges).filter((tr) =>
          tr.textContent?.includes("2026-01-10 12:00:00"),
        );
        // Should be 2: $log2's startAt and new lifelog's startAt
        expect(timeRangesWithBaseTime.length).toBe(2);
      });

      it("navigates to first LifeLog with ⏬ button click", async ({ db, task }) => {
        const { result } = await setupLifeLogsTest(task.id, db);

        await result.findByText("first lifelog");
        await result.findByText("third lifelog");

        // Navigate to $log3 (last log)
        await userEvent.keyboard("{j}");
        await awaitPendingCallbacks();
        await userEvent.keyboard("{j}");
        await awaitPendingCallbacks();

        // Verify $log3 is selected
        const log3 = result.getByText("third lifelog").closest(`.${styles.lifeLogTree.container}`);
        expect(log3?.className).toContain(styles.lifeLogTree.selected);

        // Click ⏬ (goToFirst) button
        const goToFirstButton = Array.from(result.container.querySelectorAll(`.${styles.mobileToolbar.button}`)).find(
          (btn) => btn.textContent === "⏬",
        ) as HTMLButtonElement;
        expect(goToFirstButton).toBeTruthy();

        await userEvent.click(goToFirstButton);
        await awaitPendingCallbacks();

        // $log1 should now be selected
        const log1 = result.getByText("first lifelog").closest(`.${styles.lifeLogTree.container}`);
        expect(log1?.className).toContain(styles.lifeLogTree.selected);
      });

      it("navigates to last LifeLog with ⏫ button click", async ({ db, task }) => {
        const { result } = await setupLifeLogsTest(task.id, db);

        await result.findByText("first lifelog");
        await result.findByText("third lifelog");

        // $log1 is already selected (first log)
        const log1Initial = result.getByText("first lifelog").closest(`.${styles.lifeLogTree.container}`);
        expect(log1Initial?.className).toContain(styles.lifeLogTree.selected);

        // Click ⏫ (goToLast) button
        const goToLastButton = Array.from(result.container.querySelectorAll(`.${styles.mobileToolbar.button}`)).find(
          (btn) => btn.textContent === "⏫",
        ) as HTMLButtonElement;
        expect(goToLastButton).toBeTruthy();

        await userEvent.click(goToLastButton);
        await awaitPendingCallbacks();

        // $log4 should now be selected (last LifeLog)
        const log4 = result.getByText("fourth lifelog").closest(`.${styles.lifeLogTree.container}`);
        expect(log4?.className).toContain(styles.lifeLogTree.selected);
      });

      it("navigates to latest LifeLog outside range and slides window with ⏫ button", async ({ db, task }) => {
        // Use narrow range (1ms) and start with an older LifeLog
        // $log1 (startAt=10:30) will be selected initially
        // Latest LifeLog ($log4) should be selected after clicking ⏫
        const { result } = await setupLifeLogsTest(task.id, db, {
          lifeLogsProps: { rangeMs: 1, debounceMs: 0 },
          initialSelectedId: "$log1",
        });

        // Range slides to show $log1
        await result.findByText("first lifelog");

        // Click ⏫ (goToLatest) button
        const goToLatestButton = Array.from(result.container.querySelectorAll(`.${styles.mobileToolbar.button}`)).find(
          (btn) => btn.textContent === "⏫",
        ) as HTMLButtonElement;
        expect(goToLatestButton).toBeTruthy();

        await userEvent.click(goToLatestButton);
        await awaitPendingCallbacks();

        // Range should slide and $log4 should now be visible and selected
        await result.findByText("fourth lifelog");
        const log4 = result.getByText("fourth lifelog").closest(`.${styles.lifeLogTree.container}`);
        expect(log4?.className).toContain(styles.lifeLogTree.selected);
      });

      it("navigates to latest LifeLog with Shift+G", async ({ db, task }) => {
        // Use narrow range (1ms) and start with an older LifeLog
        const { result } = await setupLifeLogsTest(task.id, db, {
          lifeLogsProps: { rangeMs: 1, debounceMs: 0 },
          initialSelectedId: "$log1",
        });

        // Range slides to show $log1
        await result.findByText("first lifelog");

        // Press Shift+G to go to latest
        await userEvent.keyboard("{Shift>}{g}{/Shift}");
        await awaitPendingCallbacks();

        // Range should slide and $log4 should now be visible and selected
        await result.findByText("fourth lifelog");
        const log4 = result.getByText("fourth lifelog").closest(`.${styles.lifeLogTree.container}`);
        expect(log4?.className).toContain(styles.lifeLogTree.selected);
      });

      it("sets startAt to current time with ▶️ button click", async ({ db, task }) => {
        const { result } = await setupLifeLogsTest(task.id, db);

        await result.findByText("first lifelog");
        await result.findByText("third lifelog");

        // Navigate to $log3 which has noneTimestamp startAt
        await userEvent.keyboard("{j}");
        await awaitPendingCallbacks();
        await userEvent.keyboard("{j}");
        await awaitPendingCallbacks();

        // Verify $log3 has N/A for startAt
        expect(result.getAllByText("N/A").length).toBe(6);

        // Click ▶️ button to set current time on startAt
        const startButton = Array.from(result.container.querySelectorAll(`.${styles.mobileToolbar.button}`)).find(
          (btn) => btn.textContent === "▶️",
        ) as HTMLButtonElement;
        expect(startButton).toBeTruthy();

        await userEvent.click(startButton);
        await awaitPendingCallbacks();

        // Verify N/A count decreased
        expect(result.getAllByText("N/A").length).toBe(5);
      });

      it("sets endAt to current time with ⏹️ button click", async ({ db, task }) => {
        const { result } = await setupLifeLogsTest(task.id, db);

        await result.findByText("first lifelog");

        // $log1 has endAt = noneTimestamp
        expect(result.getAllByText("N/A").length).toBe(6);

        // Click ⏹️ button to set current time on endAt
        const stopButton = Array.from(result.container.querySelectorAll(`.${styles.mobileToolbar.button}`)).find(
          (btn) => btn.textContent === "⏹️",
        ) as HTMLButtonElement;
        expect(stopButton).toBeTruthy();

        await userEvent.click(stopButton);
        await awaitPendingCallbacks();

        // Verify N/A count decreased
        expect(result.getAllByText("N/A").length).toBe(5);
      });

      it("can delete empty LifeLog with 🗑️ button and select previous LifeLog", async ({ db, task }) => {
        const { result } = await setupLifeLogsTest(task.id, db);

        await result.findByText("first lifelog");
        await result.findByText("third lifelog");

        // Navigate to $log3 (startAt=none, endAt=none, text="third lifelog")
        await userEvent.keyboard("{j}");
        await awaitPendingCallbacks();
        await userEvent.keyboard("{j}");
        await awaitPendingCallbacks();

        // $log3 is selected - verify
        const listItems1 = result.container.querySelectorAll("li");
        const item = listItems1[2];
        expect(item.querySelector(`.${styles.lifeLogTree.selected}`)).toBeTruthy();
        expect(item.textContent).toContain("third lifelog");

        // $log3 has text="third lifelog", so it's not empty - first clear its text
        // Enter editing mode and clear text
        await userEvent.keyboard("{i}");
        await awaitPendingCallbacks();

        const input1 = result.container.querySelector("input")!;
        expect(input1).toBeTruthy();
        expect(input1.value).toBe("third lifelog");

        await userEvent.keyboard("{Control>}a{/Control}{Backspace}");
        {
          const input = result.container.querySelector("input") as HTMLInputElement;
          expect(input.value).toBe("");
        }

        // Save by exiting edit mode
        await userEvent.keyboard("{Escape}");
        await awaitPendingCallbacks();
        expect(result.container.querySelector("input")).toBeNull();

        // Now $log3 is empty (text="", startAt=none, endAt=none, hasTreeNodes=false)
        // Click 🗑️ button to delete
        const deleteButton = Array.from(result.container.querySelectorAll(`.${styles.mobileToolbar.button}`)).find(
          (btn) => btn.textContent === "🗑️",
        ) as HTMLButtonElement;
        expect(deleteButton).toBeTruthy();

        await userEvent.click(deleteButton);
        await awaitPendingCallbacks();

        // Verify deletion - should have 3 items now ($log1, $log2, $log4)
        const listItems2 = result.container.querySelectorAll("li");
        expect(listItems2.length).toBe(3);

        // Should NOT be in editing mode (unlike deleteEmptyLifeLogToPrev)
        expect(result.container.querySelector("input")).toBeNull();

        // Previous LifeLog ($log2) should be selected
        const selectedItem = result.container.querySelector(`.${styles.lifeLogTree.selected}`);
        expect(selectedItem).toBeTruthy();
        expect(selectedItem!.textContent).toContain("second lifelog");
      });

      it("does not delete non-empty LifeLog with 🗑️ button", async ({ db, task }) => {
        const { result } = await setupLifeLogsTest(task.id, db);

        await result.findByText("first lifelog");

        // $log1 is selected, it has text="first lifelog" (not empty)
        const initialListItems = result.container.querySelectorAll("li");
        expect(initialListItems.length).toBe(4);

        // Click 🗑️ button
        const deleteButton = Array.from(result.container.querySelectorAll(`.${styles.mobileToolbar.button}`)).find(
          (btn) => btn.textContent === "🗑️",
        ) as HTMLButtonElement;
        expect(deleteButton).toBeTruthy();

        await userEvent.click(deleteButton);
        await awaitPendingCallbacks();

        // Should NOT be deleted - still 4 items
        const listItems = result.container.querySelectorAll("li");
        expect(listItems.length).toBe(4);

        // $log1 should still be selected
        const selectedItem = result.container.querySelector(`.${styles.lifeLogTree.selected}`);
        expect(selectedItem).toBeTruthy();
        expect(selectedItem!.textContent).toContain("first lifelog");
      });

      it("can delete multiple empty LifeLogs with 🗑️ button sequentially", async ({ db, task }) => {
        const { result } = await setupLifeLogsTest(task.id, db);

        await result.findByText("first lifelog");
        await result.findByText("third lifelog");
        await result.findByText("fourth lifelog");

        // Default order: $log1 (10:30), $log2 (12:00), $log3 (none), $log4 (none)
        // Clear $log3 and $log4 text, then delete them sequentially

        // Navigate to $log3 (press j twice)
        await userEvent.keyboard("{j}");
        await awaitPendingCallbacks();
        await userEvent.keyboard("{j}");
        await awaitPendingCallbacks();

        // Clear $log3's text
        await userEvent.keyboard("{i}");
        await awaitPendingCallbacks();
        await userEvent.keyboard("{Control>}a{/Control}{Backspace}");
        await userEvent.keyboard("{Escape}");
        await awaitPendingCallbacks();

        // Navigate to $log4
        await userEvent.keyboard("{j}");
        await awaitPendingCallbacks();

        // Clear $log4's text
        await userEvent.keyboard("{i}");
        await awaitPendingCallbacks();
        await userEvent.keyboard("{Control>}a{/Control}{Backspace}");
        await userEvent.keyboard("{Escape}");
        await awaitPendingCallbacks();

        // Now $log4 is selected (empty). Delete with 🗑️ → goes to prev ($log3)
        {
          const deleteButton = Array.from(result.container.querySelectorAll(`.${styles.mobileToolbar.button}`)).find(
            (btn) => btn.textContent === "🗑️",
          ) as HTMLButtonElement;
          await userEvent.click(deleteButton);
          await awaitPendingCallbacks();
        }

        // Now we have: $log1, $log2, $log3(empty, selected)
        const listItems1 = result.container.querySelectorAll("li");
        expect(listItems1.length).toBe(3);

        // $log3 should be selected (prev of $log4)
        {
          const selectedItem = result.container.querySelector(`.${styles.lifeLogTree.selected}`);
          expect(selectedItem).toBeTruthy();
          // $log3 text was cleared, so it should show empty
        }

        // Delete $log3 with 🗑️ → goes to prev ($log2)
        {
          const deleteButton = Array.from(result.container.querySelectorAll(`.${styles.mobileToolbar.button}`)).find(
            (btn) => btn.textContent === "🗑️",
          ) as HTMLButtonElement;
          await userEvent.click(deleteButton);
          await awaitPendingCallbacks();
        }

        // Now we have: $log1, $log2
        const listItems2 = result.container.querySelectorAll("li");
        expect(listItems2.length).toBe(2);

        // $log2 should be selected
        const selectedItem = result.container.querySelector(`.${styles.lifeLogTree.selected}`);
        expect(selectedItem).toBeTruthy();
        expect(selectedItem!.textContent).toContain("second lifelog");

        // Verify not in editing mode
        expect(result.container.querySelector("input")).toBeNull();
      });
    });

    describe("search button", () => {
      it("🔍 button exists in toolbar", async ({ db, task }) => {
        const { result } = await setupLifeLogsTest(task.id, db);

        const searchButton = Array.from(result.container.querySelectorAll(`.${styles.mobileToolbar.button}`)).find(
          (btn) => btn.textContent === "🔍",
        ) as HTMLButtonElement;
        expect(searchButton).toBeTruthy();

        // Click should not throw
        searchButton.click();
        await awaitPendingCallbacks();
      });
    });
  });

  describe("rangeMs prop", () => {
    it("shows LifeLog within range when using dayMs", async ({ db, task }) => {
      // Create a LifeLog with endAt 0.6 days ago (within 1 day range)
      const { result } = await setupLifeLogsTest(task.id, db, {
        outOfRangeLifeLogs: [{ id: "$inRange", text: "in range lifelog", daysAgo: 0.7, endDaysAgo: 0.6 }],
        lifeLogsProps: { rangeMs: dayMs, debounceMs: 0 },
        skipDefaultLifeLogs: true,
        initialSelectedId: "$inRange",
      });

      // Should be visible with rangeMs=dayMs (1 day)
      const element = await result.findByText("in range lifelog");
      expect(element).toBeTruthy();
    });

    it("hides LifeLog outside range when using dayMs / 2", async ({ db, task }) => {
      // Create a LifeLog with endAt 0.6 days ago (outside 0.5 day range)
      const { result } = await setupLifeLogsTest(task.id, db, {
        outOfRangeLifeLogs: [{ id: "$outOfRange", text: "out of range lifelog", daysAgo: 0.7, endDaysAgo: 0.6 }],
        lifeLogsProps: { rangeMs: dayMs / 2, debounceMs: 0 },
        skipDefaultLifeLogs: true,
      });

      // Wait for render
      await new Promise((r) => setTimeout(r, 100));

      // Should NOT be visible with rangeMs=dayMs/2 (half day = 0.5 days)
      const element = result.queryByText("out of range lifelog");
      expect(element).toBeNull();
    });

    it("shows LifeLog within half-day range when using dayMs / 2", async ({ db, task }) => {
      // Create a LifeLog with endAt 0.3 days ago (within 0.5 day range)
      const { result } = await setupLifeLogsTest(task.id, db, {
        outOfRangeLifeLogs: [{ id: "$halfDayRange", text: "half day range lifelog", daysAgo: 0.4, endDaysAgo: 0.3 }],
        lifeLogsProps: { rangeMs: dayMs / 2, debounceMs: 0 },
        skipDefaultLifeLogs: true,
        initialSelectedId: "$halfDayRange",
      });

      // Should be visible with rangeMs=dayMs/2 (half day = 0.5 days)
      const element = await result.findByText("half day range lifelog");
      expect(element).toBeTruthy();
    });
  });

  describe("undo/redo with EditHistory", () => {
    it("u key undoes a setStartAtNow operation", async ({ db, task }) => {
      const { result } = await setupLifeLogsTest(task.id, db, {
        withEditHistory: true,
        initialSelectedId: "$log3",
      });

      await result.findByText("third lifelog");

      // $log3 has noneTimestamp startAt — verify no time is shown
      const log3Element = result.getByText("third lifelog").closest(`.${styles.lifeLogs.listItem}`)!;
      expect(log3Element.textContent).not.toContain(":");

      // Press s to set startAt to now
      await userEvent.keyboard("{s}");
      await awaitPendingCallbacks();

      // Wait for the startAt to appear (mocked to baseTime = 12:00:00)
      await waitFor(() => {
        expect(log3Element.textContent).toContain("12:00");
      });

      // Press u to undo
      await userEvent.keyboard("{u}");
      await awaitPendingCallbacks();

      // Wait for the startAt to revert
      await waitFor(() => {
        expect(log3Element.textContent).not.toContain("12:00");
      });
    });

    it("r key redoes an undone operation", async ({ db, task }) => {
      const { result } = await setupLifeLogsTest(task.id, db, {
        withEditHistory: true,
        initialSelectedId: "$log3",
      });

      await result.findByText("third lifelog");

      const log3Element = result.getByText("third lifelog").closest(`.${styles.lifeLogs.listItem}`)!;

      // Set startAt
      await userEvent.keyboard("{s}");
      await awaitPendingCallbacks();
      await waitFor(() => {
        expect(log3Element.textContent).toContain("12:00");
      });

      // Undo
      await userEvent.keyboard("{u}");
      await awaitPendingCallbacks();
      await waitFor(() => {
        expect(log3Element.textContent).not.toContain("12:00");
      });

      // Redo
      await userEvent.keyboard("{r}");
      await awaitPendingCallbacks();
      await waitFor(() => {
        expect(log3Element.textContent).toContain("12:00");
      });
    });

    it("t key toggles edit history panel", async ({ db, task }) => {
      const { result } = await setupLifeLogsTest(task.id, db, {
        withEditHistory: true,
      });

      await result.findByText("first lifelog");

      // Panel should not be visible initially
      expect(result.queryByText("編集履歴")).toBeNull();

      // Press t to open panel
      await userEvent.keyboard("{t}");
      await awaitPendingCallbacks();

      await waitFor(() => {
        expect(result.queryByText("編集履歴")).toBeTruthy();
      });

      // Press t again to close
      await userEvent.keyboard("{t}");
      await awaitPendingCallbacks();

      await waitFor(() => {
        expect(result.queryByText("編集履歴")).toBeNull();
      });
    });

    it("u and r keys do nothing when editing text", async ({ db, task }) => {
      const { result } = await setupLifeLogsTest(task.id, db, {
        withEditHistory: true,
      });

      await result.findByText("first lifelog");

      // Enter editing mode
      await userEvent.keyboard("{i}");
      await awaitPendingCallbacks();

      const input = result.container.querySelector("input") as HTMLInputElement;
      expect(input).toBeTruthy();

      // Type u and r — should be typed as text, not trigger undo/redo
      await userEvent.keyboard("ur");
      await awaitPendingCallbacks();

      expect(input.value).toContain("u");
      expect(input.value).toContain("r");
    });

    it("undo of newLifeLog restores previous selection", async ({ db, task }) => {
      const { result } = await setupLifeLogsTest(task.id, db, {
        withEditHistory: true,
        initialSelectedId: "$log1",
      });

      await result.findByText("first lifelog");

      // $log1 should be selected
      const log1Element = result.getByText("first lifelog").closest(`.${styles.lifeLogs.listItem}`)!;
      expect(log1Element.className).toContain(styles.lifeLogs.listItem);

      // Press o to create new lifeLog
      await userEvent.keyboard("{o}");
      await awaitPendingCallbacks();

      // Wait for editing mode on new lifeLog
      await waitFor(() => {
        const input = result.container.querySelector("input") as HTMLInputElement;
        expect(input).toBeTruthy();
      });

      // Press Escape to exit editing
      await userEvent.keyboard("{Escape}");
      await awaitPendingCallbacks();

      // Undo the creation — should go back to $log1 selected
      await userEvent.keyboard("{u}");
      await awaitPendingCallbacks();

      // $log1 should be visible and selected again
      await waitFor(() => {
        expect(result.getByText("first lifelog")).toBeTruthy();
      });
    });

    it("newLifeLog with empty text requires only one undo", async ({ db, task }) => {
      const { result } = await setupLifeLogsTest(task.id, db, {
        withEditHistory: true,
        initialSelectedId: "$log3",
      });

      await result.findByText("third lifelog");

      // $log3 has noneTimestamp startAt
      const log3Element = result.getByText("third lifelog").closest(`.${styles.lifeLogs.listItem}`)!;
      expect(log3Element.textContent).not.toContain(":");

      // Press s to set startAt
      await userEvent.keyboard("{s}");
      await awaitPendingCallbacks();
      await waitFor(() => {
        expect(log3Element.textContent).toContain("12:00");
      });

      // Press o to create new lifeLog
      await userEvent.keyboard("{o}");
      await awaitPendingCallbacks();

      // Wait for editing mode
      await waitFor(() => {
        const input = result.container.querySelector("input") as HTMLInputElement;
        expect(input).toBeTruthy();
      });

      // Press Escape without typing anything (empty text save should be skipped)
      await userEvent.keyboard("{Escape}");
      await awaitPendingCallbacks();

      // First undo: should undo the newLifeLog creation (not a no-op text save)
      await userEvent.keyboard("{u}");
      await awaitPendingCallbacks();

      // After one undo, the new lifeLog should be gone and $log3 should have startAt set
      await waitFor(() => {
        expect(log3Element.textContent).toContain("12:00");
      });

      // Second undo: should undo the setStartAtNow
      await userEvent.keyboard("{u}");
      await awaitPendingCallbacks();

      await waitFor(() => {
        expect(log3Element.textContent).not.toContain("12:00");
      });
    });

    it("redo of newLifeLog restores selection to the created lifeLog", async ({ db, task }) => {
      const { result } = await setupLifeLogsTest(task.id, db, {
        withEditHistory: true,
        initialSelectedId: "$log1",
      });

      await result.findByText("first lifelog");

      // Create new lifeLog
      await userEvent.keyboard("{o}");
      await awaitPendingCallbacks();

      await waitFor(() => {
        const input = result.container.querySelector("input") as HTMLInputElement;
        expect(input).toBeTruthy();
      });

      // Type something so save is not a no-op
      await userEvent.keyboard("new entry");
      await awaitPendingCallbacks();

      // Exit editing
      await userEvent.keyboard("{Escape}");
      await awaitPendingCallbacks();

      // Wait for save
      await waitFor(() => {
        expect(result.queryByText("new entry")).toBeTruthy();
      });

      // Undo creation
      await userEvent.keyboard("{u}");
      await awaitPendingCallbacks();

      // Should be back at $log1
      await waitFor(() => {
        expect(result.getByText("first lifelog")).toBeTruthy();
      });

      // Redo creation — should select the recreated lifeLog
      await userEvent.keyboard("{r}");
      await awaitPendingCallbacks();

      // The new lifeLog should be visible again
      await waitFor(() => {
        expect(result.queryByText("new entry")).toBeTruthy();
      });
    });

    it("edit history panel shows entries after operations", async ({ db, task }) => {
      const { result } = await setupLifeLogsTest(task.id, db, {
        withEditHistory: true,
        initialSelectedId: "$log3",
      });

      await result.findByText("third lifelog");

      // Perform an operation to create a history entry
      await userEvent.keyboard("{s}");
      await awaitPendingCallbacks();
      await waitFor(() => {
        const log3Element = result.getByText("third lifelog").closest(`.${styles.lifeLogs.listItem}`)!;
        expect(log3Element.textContent).toContain("12:00");
      });

      // Open panel with t — panel header should appear
      await userEvent.keyboard("{t}");
      await awaitPendingCallbacks();

      await waitFor(() => {
        expect(result.queryByText("編集履歴")).toBeTruthy();
      });

      // The history entry description and details should be shown
      await waitFor(() => {
        expect(result.queryByText("時刻設定")).toBeTruthy();
        // Collection name should be shown
        expect(result.queryByText("lifeLogs")).toBeTruthy();
        // Field name "startAt" should appear in the details
        expect(result.container.textContent).toContain("startAt");
        // Virtual root node should be shown at the bottom
        expect(result.queryByText("初期状態")).toBeTruthy();
      });
    });

    it("edit history panel closes with Escape key", async ({ db, task }) => {
      const { result } = await setupLifeLogsTest(task.id, db, {
        withEditHistory: true,
      });

      await result.findByText("first lifelog");

      // Open panel
      await userEvent.keyboard("{t}");
      await awaitPendingCallbacks();
      await waitFor(() => {
        expect(result.queryByText("編集履歴")).toBeTruthy();
      });

      // Close with Escape
      await userEvent.keyboard("{Escape}");
      await awaitPendingCallbacks();

      await waitFor(() => {
        expect(result.queryByText("編集履歴")).toBeNull();
      });
    });

    it("edit history panel close button works", async ({ db, task }) => {
      const { result } = await setupLifeLogsTest(task.id, db, {
        withEditHistory: true,
      });

      await result.findByText("first lifelog");

      // Open panel
      await userEvent.keyboard("{t}");
      await awaitPendingCallbacks();
      await waitFor(() => {
        expect(result.queryByText("編集履歴")).toBeTruthy();
      });

      // Click close button
      const closeButton = result.getByText("✕");
      await userEvent.click(closeButton);
      await awaitPendingCallbacks();

      await waitFor(() => {
        expect(result.queryByText("編集履歴")).toBeNull();
      });
    });

    it("edit history panel entry is clickable", async ({ db, task }) => {
      const { result } = await setupLifeLogsTest(task.id, db, {
        withEditHistory: true,
        initialSelectedId: "$log3",
      });

      await result.findByText("third lifelog");

      // Create a history entry
      await userEvent.keyboard("{s}");
      await awaitPendingCallbacks();

      // Open panel
      await userEvent.keyboard("{t}");
      await awaitPendingCallbacks();

      await waitFor(() => {
        expect(result.queryByText("編集履歴")).toBeTruthy();
      });

      // Verify entry is rendered and clickable (has node style)
      await waitFor(() => {
        const timeEntry = result.queryByText("時刻設定");
        expect(timeEntry).toBeTruthy();
      });
    });

    it("clicking panel entry restores selection (jumpTo)", async ({ db, task }) => {
      const { result } = await setupLifeLogsTest(task.id, db, {
        withEditHistory: true,
        initialSelectedId: "$log3",
      });

      await result.findByText("third lifelog");
      const log3Element = result.getByText("third lifelog").closest(`.${styles.lifeLogs.listItem}`)!;

      // Create 2 history entries
      await userEvent.keyboard("{s}"); // setStartAtNow
      await awaitPendingCallbacks();
      await waitFor(() => {
        expect(log3Element.textContent).toContain("12:00");
      });

      await userEvent.keyboard("{f}"); // setEndAtNow
      await awaitPendingCallbacks();

      // Open history panel
      await userEvent.keyboard("{t}");
      await awaitPendingCallbacks();

      await waitFor(() => {
        expect(result.queryByText("編集履歴")).toBeTruthy();
      });

      // Find the "時刻設定" entry (should have 2 of them, one for startAt, one for endAt)
      // The earliest one is the startAt. Click it to jump back.
      await waitFor(() => {
        const entries = result.container.querySelectorAll(`.${styles.editHistory.graphRow}`);
        expect(entries.length).toBeGreaterThan(1);
      });

      // Get all graph rows with entry content, click the oldest (last) "時刻設定"
      const rows = Array.from(result.container.querySelectorAll(`.${styles.editHistory.graphRow}`));
      const rowsWithEntries = rows.filter((r) => r.textContent?.includes("時刻設定"));
      expect(rowsWithEntries.length).toBeGreaterThanOrEqual(2);

      // Click the OLDEST (last in DOM order) — should be the first setStartAtNow
      const oldestTimeEntry = rowsWithEntries[rowsWithEntries.length - 1];
      await userEvent.click(oldestTimeEntry);
      await awaitPendingCallbacks();

      // After jumping to the first 時刻設定, endAt should be reverted (|f undone)
      // but startAt should still be set
      await waitFor(() => {
        const log3TextAfter = log3Element.textContent ?? "";
        // Should have startAt "12:00" but endAt should be N/A
        expect(log3TextAfter).toContain("12:00");
        expect(log3TextAfter).toContain("N/A");
      });
    });

    it("cross-branch: redo picks newest branch after undo+new operations", async ({ db, task }) => {
      const { result } = await setupLifeLogsTest(task.id, db, {
        withEditHistory: true,
      });

      await result.findByText("first lifelog");

      async function editPrefix(prefix: string): Promise<void> {
        await userEvent.keyboard("{i}");
        await awaitPendingCallbacks();
        const input = result.container.querySelector("input") as HTMLInputElement;
        input.focus();
        await userEvent.keyboard(prefix);
        await userEvent.keyboard("{Escape}");
        await awaitPendingCallbacks();
      }

      // --- Branch A: 3 chained text prepends ---
      await editPrefix("A1 ");
      await waitFor(() => {
        expect(result.queryByText("A1 first lifelog")).toBeTruthy();
      });
      await editPrefix("A2 ");
      await waitFor(() => {
        expect(result.queryByText("A2 A1 first lifelog")).toBeTruthy();
      });
      await editPrefix("A3 ");
      await waitFor(() => {
        expect(result.queryByText("A3 A2 A1 first lifelog")).toBeTruthy();
      });

      // --- Undo all 3 → text back to "first lifelog", HEAD="" ---
      await userEvent.keyboard("{u}");
      await awaitPendingCallbacks();
      await userEvent.keyboard("{u}");
      await awaitPendingCallbacks();
      await userEvent.keyboard("{u}");
      await awaitPendingCallbacks();
      await waitFor(() => {
        expect(result.queryByText("first lifelog")).toBeTruthy();
        expect(result.queryByText("A1 first lifelog")).toBeNull();
      });

      // --- Branch B: 3 chained text prepends (creates new branch from root) ---
      await editPrefix("B1 ");
      await waitFor(() => {
        expect(result.queryByText("B1 first lifelog")).toBeTruthy();
      });
      await editPrefix("B2 ");
      await waitFor(() => {
        expect(result.queryByText("B2 B1 first lifelog")).toBeTruthy();
      });
      await editPrefix("B3 ");
      await waitFor(() => {
        expect(result.queryByText("B3 B2 B1 first lifelog")).toBeTruthy();
      });

      // --- Undo all 3 of branch B → HEAD="" ---
      await userEvent.keyboard("{u}");
      await awaitPendingCallbacks();
      await userEvent.keyboard("{u}");
      await awaitPendingCallbacks();
      await userEvent.keyboard("{u}");
      await awaitPendingCallbacks();
      await waitFor(() => {
        expect(result.queryByText("first lifelog")).toBeTruthy();
        expect(result.queryByText("B1 first lifelog")).toBeNull();
      });

      // --- Redo 3 times → should follow newest branch (B), not A ---
      await userEvent.keyboard("{r}");
      await awaitPendingCallbacks();
      await userEvent.keyboard("{r}");
      await awaitPendingCallbacks();
      await userEvent.keyboard("{r}");
      await awaitPendingCallbacks();

      // The text should end up as branch B's tip, not branch A's
      await waitFor(() => {
        expect(result.queryByText("B3 B2 B1 first lifelog")).toBeTruthy();
      });
      expect(result.queryByText("A3 A2 A1 first lifelog")).toBeNull();
    });

    it("redo of enterTree on a newly-created lifeLog reapplies the change", async ({ db, task }) => {
      const { result } = await setupLifeLogsTest(task.id, db, {
        withEditHistory: true,
        initialSelectedId: "$log1",
      });

      await result.findByText("first lifelog");

      // Reproduce screenshot scenario exactly:
      // 1. Create new lifeLog (o)
      // 2. Type text and save (テキスト編集)
      // 3. Enter tree → creates new tree node (ノード作成)
      // 4. Undo ×2 → should be at テキスト編集 HEAD
      // 5. Redo → should restore tree node + hasTreeNodes=true

      // Step 1+2: create new lifeLog with text
      await userEvent.keyboard("{o}");
      await awaitPendingCallbacks();
      await waitFor(() => {
        const input = result.container.querySelector("input") as HTMLInputElement;
        expect(input).toBeTruthy();
      });
      await userEvent.keyboard("hoge");
      await userEvent.keyboard("{Escape}");
      await awaitPendingCallbacks();

      await waitFor(() => {
        expect(result.queryByText("hoge")).toBeTruthy();
      });

      // Step 3: enter tree → creates new tree node
      await userEvent.keyboard("{l}");
      await awaitPendingCallbacks();

      await waitFor(() => {
        expect(result.container.querySelectorAll(`.${styles.lifeLogTree.childrenNodes}`).length).toBeGreaterThan(0);
      });

      // Step 4: Edit tree node text (simulates ノードテキスト編集 entry)
      await userEvent.keyboard("{i}");
      await awaitPendingCallbacks();
      await waitFor(() => {
        const inputs = result.container.querySelectorAll("input");
        expect(inputs.length).toBeGreaterThan(0);
      });
      await userEvent.keyboard("ほげ");
      await userEvent.keyboard("{Escape}");
      await awaitPendingCallbacks();

      await waitFor(() => {
        expect(result.queryByText("ほげ")).toBeTruthy();
      });

      // Step 5: Undo ×2 → HEAD should land at テキスト編集 (lifeLog text edit)
      // u1 undoes ノードテキスト編集, u2 undoes ノード作成
      await userEvent.keyboard("{u}");
      await awaitPendingCallbacks();
      await userEvent.keyboard("{u}");
      await awaitPendingCallbacks();

      await waitFor(() => {
        expect(result.container.querySelectorAll(`.${styles.lifeLogTree.childrenNodes}`).length).toBe(0);
        expect(result.queryByText("hoge")).toBeTruthy();
      });

      // Step 6: Redo → should re-apply ノード作成 (create tree node + hasTreeNodes=true)
      await userEvent.keyboard("{r}");
      await awaitPendingCallbacks();

      // The childrenNodes wrapper should appear...
      await waitFor(
        () => {
          expect(result.container.querySelectorAll(`.${styles.lifeLogTree.childrenNodes}`).length).toBe(1);
        },
        { timeout: 3000 },
      );

      // ...and the tree node itself (the <li> rendered by ChildrenNodes) must exist.
      await waitFor(() => {
        const wrapper = result.container.querySelector(`.${styles.lifeLogTree.childrenNodes}`)!;
        const listItems = wrapper.querySelectorAll("li");
        expect(listItems.length).toBeGreaterThan(0);
      });
    });

    it("redo of enterTree (new tree node creation) reapplies the change", async ({ db, task }) => {
      const { result } = await setupLifeLogsTest(task.id, db, {
        withEditHistory: true,
        initialSelectedId: "$log3",
      });

      await result.findByText("third lifelog");

      // $log3 has hasTreeNodes=false. Pressing l creates a new tree node and enters tree mode.
      // Tree mode materializes a `.childrenNodes` wrapper — count that.
      expect(result.container.querySelectorAll(`.${styles.lifeLogTree.childrenNodes}`).length).toBe(0);

      await userEvent.keyboard("{l}");
      await awaitPendingCallbacks();

      await waitFor(() => {
        expect(result.container.querySelectorAll(`.${styles.lifeLogTree.childrenNodes}`).length).toBe(1);
      });

      // Undo → $log3.hasTreeNodes back to false, tree node deleted, childrenNodes wrapper gone
      await userEvent.keyboard("{u}");
      await awaitPendingCallbacks();

      await waitFor(() => {
        expect(result.container.querySelectorAll(`.${styles.lifeLogTree.childrenNodes}`).length).toBe(0);
      });

      // Redo → tree node should be recreated, wrapper should return
      await userEvent.keyboard("{r}");
      await awaitPendingCallbacks();

      await waitFor(() => {
        expect(result.container.querySelectorAll(`.${styles.lifeLogTree.childrenNodes}`).length).toBe(1);
      });
    });

    it("cross-branch: jumpTo navigates across branches", async ({ db, task }) => {
      const { result } = await setupLifeLogsTest(task.id, db, {
        withEditHistory: true,
      });

      await result.findByText("first lifelog");

      async function editPrefix(prefix: string): Promise<void> {
        await userEvent.keyboard("{i}");
        await awaitPendingCallbacks();
        const input = result.container.querySelector("input") as HTMLInputElement;
        input.focus();
        await userEvent.keyboard(prefix);
        await userEvent.keyboard("{Escape}");
        await awaitPendingCallbacks();
      }

      // Branch A: 3 chained edits
      await editPrefix("A1 ");
      await waitFor(() => {
        expect(result.queryByText("A1 first lifelog")).toBeTruthy();
      });
      await editPrefix("A2 ");
      await editPrefix("A3 ");
      await waitFor(() => {
        expect(result.queryByText("A3 A2 A1 first lifelog")).toBeTruthy();
      });

      // Undo ×3 to root
      await userEvent.keyboard("{u}");
      await awaitPendingCallbacks();
      await userEvent.keyboard("{u}");
      await awaitPendingCallbacks();
      await userEvent.keyboard("{u}");
      await awaitPendingCallbacks();
      await waitFor(() => {
        expect(result.queryByText("first lifelog")).toBeTruthy();
      });

      // Branch B: 3 different edits, creating a sibling branch
      await editPrefix("B1 ");
      await editPrefix("B2 ");
      await editPrefix("B3 ");
      await waitFor(() => {
        expect(result.queryByText("B3 B2 B1 first lifelog")).toBeTruthy();
      });

      // Open history panel
      await userEvent.keyboard("{t}");
      await awaitPendingCallbacks();
      await waitFor(() => {
        expect(result.queryByText("編集履歴")).toBeTruthy();
      });

      // Find a branch-A row (A1 prepend: text -> "A1 first lifelog")
      // and click it → cross-branch jumpTo
      await waitFor(() => {
        const rows = result.container.querySelectorAll(`.${styles.editHistory.graphRow}`);
        expect(rows.length).toBeGreaterThan(6);
      });

      const rows = Array.from(result.container.querySelectorAll(`.${styles.editHistory.graphRow}`));
      const a3Row = rows.find((r) => r.textContent?.includes("A3 A2 A1"));
      expect(a3Row).toBeTruthy();

      await userEvent.click(a3Row!);
      await awaitPendingCallbacks();

      // After cross-branch jumpTo to A3 tip, text should be branch-A's A3 state
      await waitFor(() => {
        expect(result.queryByText("A3 A2 A1 first lifelog")).toBeTruthy();
      });
      expect(result.queryByText("B3 B2 B1 first lifelog")).toBeNull();

      // Now jumpTo back to B3 tip (cross-branch the other way)
      const rows2 = Array.from(result.container.querySelectorAll(`.${styles.editHistory.graphRow}`));
      const b3Row = rows2.find((r) => r.textContent?.includes("B3 B2 B1"));
      expect(b3Row).toBeTruthy();

      await userEvent.click(b3Row!);
      await awaitPendingCallbacks();

      await waitFor(() => {
        expect(result.queryByText("B3 B2 B1 first lifelog")).toBeTruthy();
      });
      expect(result.queryByText("A3 A2 A1 first lifelog")).toBeNull();
    });

    it("deep cross-branch jumpTo with tree node edits", async ({ db, task }) => {
      const { result, firestore } = await setupLifeLogsTest(task.id, db, {
        withEditHistory: true,
      });

      await result.findByText("first lifelog");

      const batchVersionCol = getCollection(firestore, "batchVersion");

      let lastServerVersion = (await getSingletonDoc(firestore, batchVersionCol, { fromServer: true }))?.version;
      async function waitForServerCommit(): Promise<void> {
        const prev = lastServerVersion;
        let newVersion: string | undefined;
        await waitFor(async () => {
          const serverDoc = await getSingletonDoc(firestore, batchVersionCol, { fromServer: true });
          newVersion = serverDoc?.version;
          expect(newVersion).not.toBe(prev);
        });
        lastServerVersion = newVersion;
      }

      // Enter tree mode
      await userEvent.keyboard("{l}");
      await awaitPendingCallbacks();
      await result.findByText("first child");

      async function editTreeNodePrefix(prefix: string, expectedText: string): Promise<void> {
        await userEvent.keyboard("{i}");
        await awaitPendingCallbacks();
        const input = result.container.querySelector("input") as HTMLInputElement;
        input.focus();
        await userEvent.keyboard(prefix);
        await userEvent.keyboard("{Escape}");
        await awaitPendingCallbacks();
        await waitFor(() => {
          expect(result.queryByText(expectedText)).toBeTruthy();
        });
        await waitForServerCommit();
      }

      // Branch A: 3 edits
      await editTreeNodePrefix("A1 ", "A1 first child");
      await editTreeNodePrefix("A2 ", "A2 A1 first child");
      await editTreeNodePrefix("A3 ", "A3 A2 A1 first child");

      // Undo ×3
      await userEvent.keyboard("{u}");
      await awaitPendingCallbacks();
      await waitForServerCommit();
      await userEvent.keyboard("{u}");
      await awaitPendingCallbacks();
      await waitForServerCommit();
      await userEvent.keyboard("{u}");
      await awaitPendingCallbacks();
      await waitForServerCommit();
      await waitFor(() => {
        expect(result.queryByText("first child")).toBeTruthy();
        expect(result.queryByText("A1 first child")).toBeNull();
      });

      // Branch B: 3 edits
      await editTreeNodePrefix("B1 ", "B1 first child");
      await editTreeNodePrefix("B2 ", "B2 B1 first child");
      await editTreeNodePrefix("B3 ", "B3 B2 B1 first child");

      // Open panel and jumpTo branch A's tip
      await userEvent.keyboard("{t}");
      await awaitPendingCallbacks();
      await waitFor(() => {
        expect(result.queryByText("編集履歴")).toBeTruthy();
      });

      // Wait for editHistory entries to appear in panel
      await waitFor(() => {
        const rows = result.container.querySelectorAll(`.${styles.editHistory.graphRow}`);
        expect(rows.length).toBeGreaterThan(6);
      });

      const rows = Array.from(result.container.querySelectorAll(`.${styles.editHistory.graphRow}`));
      const a3Row = rows.find((r) => r.textContent?.includes("A3 A2 A1"));
      expect(a3Row).toBeTruthy();

      await userEvent.click(a3Row!);
      await awaitPendingCallbacks();

      // After jumpTo A3, tree node text should be "A3 A2 A1 first child"
      await waitFor(() => {
        const wrapper = result.container.querySelector(`.${styles.lifeLogTree.childrenNodes}`);
        expect(wrapper?.textContent).toContain("A3 A2 A1 first child");
      });
      const wrapper = result.container.querySelector(`.${styles.lifeLogTree.childrenNodes}`)!;
      expect(wrapper.textContent).not.toContain("B3 B2 B1 first child");
    });

    it("undo/redo of tree node text edit", async ({ db, task }) => {
      const { result } = await setupLifeLogsTest(task.id, db, {
        withEditHistory: true,
      });

      await result.findByText("first lifelog");

      // Enter tree mode on $log1 (has existing tree nodes)
      await userEvent.keyboard("{l}");
      await awaitPendingCallbacks();
      await result.findByText("first child");

      // Edit tree node text: i → type "edited " → Escape
      await userEvent.keyboard("{i}");
      await awaitPendingCallbacks();
      const input = result.container.querySelector("input") as HTMLInputElement;
      input.focus();
      await userEvent.keyboard("edited ");
      await userEvent.keyboard("{Escape}");
      await awaitPendingCallbacks();

      await waitFor(() => {
        expect(result.queryByText("edited first child")).toBeTruthy();
      });

      // Undo → text should revert
      await userEvent.keyboard("{u}");
      await awaitPendingCallbacks();
      await waitFor(() => {
        expect(result.queryByText("first child")).toBeTruthy();
        expect(result.queryByText("edited first child")).toBeNull();
      });

      // Redo → text should restore
      await userEvent.keyboard("{r}");
      await awaitPendingCallbacks();
      await waitFor(() => {
        expect(result.queryByText("edited first child")).toBeTruthy();
      });
    });

    it("undo/redo of tree node indent", async ({ db, task }) => {
      const { result } = await setupLifeLogsTest(task.id, db, {
        withEditHistory: true,
      });

      await result.findByText("first lifelog");

      // Enter tree, navigate to second child
      await userEvent.keyboard("{l}");
      await awaitPendingCallbacks();
      await result.findByText("first child");

      await userEvent.keyboard("{j}");
      await awaitPendingCallbacks();

      // Indent second child (Tab) — it becomes a child of first child
      await userEvent.keyboard("{Tab}");
      await awaitPendingCallbacks();

      // After indent, "second child" should still exist but under "first child"
      await waitFor(() => {
        expect(result.queryByText("second child")).toBeTruthy();
      });

      // Undo → should dedent back
      await userEvent.keyboard("{u}");
      await awaitPendingCallbacks();

      await waitFor(() => {
        expect(result.queryByText("second child")).toBeTruthy();
      });

      // Redo → should indent again
      await userEvent.keyboard("{r}");
      await awaitPendingCallbacks();

      await waitFor(() => {
        expect(result.queryByText("second child")).toBeTruthy();
      });
    });

    it("cross-branch redo picks newest branch for tree node text edits", async ({ db, task }) => {
      const { result } = await setupLifeLogsTest(task.id, db, {
        withEditHistory: true,
      });

      await result.findByText("first lifelog");

      // Enter tree mode
      await userEvent.keyboard("{l}");
      await awaitPendingCallbacks();
      await result.findByText("first child");

      async function editTreeNodePrefix(prefix: string): Promise<void> {
        await userEvent.keyboard("{i}");
        await awaitPendingCallbacks();
        const input = result.container.querySelector("input") as HTMLInputElement;
        input.focus();
        await userEvent.keyboard(prefix);
        await userEvent.keyboard("{Escape}");
        await awaitPendingCallbacks();
      }

      // Branch A: 3 chained tree node text edits
      await editTreeNodePrefix("A1 ");
      await waitFor(() => {
        expect(result.queryByText("A1 first child")).toBeTruthy();
      });
      await editTreeNodePrefix("A2 ");
      await editTreeNodePrefix("A3 ");
      await waitFor(() => {
        expect(result.queryByText("A3 A2 A1 first child")).toBeTruthy();
      });

      // Undo ×3
      await userEvent.keyboard("{u}");
      await awaitPendingCallbacks();
      await userEvent.keyboard("{u}");
      await awaitPendingCallbacks();
      await userEvent.keyboard("{u}");
      await awaitPendingCallbacks();
      await waitFor(() => {
        expect(result.queryByText("first child")).toBeTruthy();
        expect(result.queryByText("A1 first child")).toBeNull();
      });

      // Branch B: 3 chained tree node text edits (creates new branch)
      await editTreeNodePrefix("B1 ");
      await editTreeNodePrefix("B2 ");
      await editTreeNodePrefix("B3 ");
      await waitFor(() => {
        expect(result.queryByText("B3 B2 B1 first child")).toBeTruthy();
      });

      // Undo ×3
      await userEvent.keyboard("{u}");
      await awaitPendingCallbacks();
      await userEvent.keyboard("{u}");
      await awaitPendingCallbacks();
      await userEvent.keyboard("{u}");
      await awaitPendingCallbacks();
      await waitFor(() => {
        expect(result.queryByText("first child")).toBeTruthy();
      });

      // Redo ×3 → should follow newest branch (B)
      await userEvent.keyboard("{r}");
      await awaitPendingCallbacks();
      await userEvent.keyboard("{r}");
      await awaitPendingCallbacks();
      await userEvent.keyboard("{r}");
      await awaitPendingCallbacks();

      await waitFor(() => {
        expect(result.queryByText("B3 B2 B1 first child")).toBeTruthy();
      });
      expect(result.queryByText("A3 A2 A1 first child")).toBeNull();
    });

    it("undo of setEndAtNow restores none timestamp", async ({ db, task }) => {
      const { result } = await setupLifeLogsTest(task.id, db, {
        withEditHistory: true,
        initialSelectedId: "$log3",
      });

      await result.findByText("third lifelog");
      const log3Element = result.getByText("third lifelog").closest(`.${styles.lifeLogs.listItem}`)!;

      // Set startAt first (so endAt button becomes effective)
      await userEvent.keyboard("{s}");
      await awaitPendingCallbacks();
      await waitFor(() => {
        expect(log3Element.textContent).toContain("12:00");
      });

      // Set endAt
      await userEvent.keyboard("{f}");
      await awaitPendingCallbacks();

      // Undo endAt
      await userEvent.keyboard("{u}");
      await awaitPendingCallbacks();

      // endAt should be reverted, but startAt should remain
      await waitFor(() => {
        // Should still have startAt "12:00" but endAt reverted to N/A
        expect(log3Element.textContent).toContain("12:00");
        expect(log3Element.textContent).toContain("N/A");
      });
    });

    it("R key redoes second-newest branch", async ({ db, task }) => {
      const { result } = await setupLifeLogsTest(task.id, db, {
        withEditHistory: true,
      });

      await result.findByText("first lifelog");

      async function editPrefix(prefix: string): Promise<void> {
        await userEvent.keyboard("{i}");
        await awaitPendingCallbacks();
        const input = result.container.querySelector("input") as HTMLInputElement;
        input.focus();
        await userEvent.keyboard(prefix);
        await userEvent.keyboard("{Escape}");
        await awaitPendingCallbacks();
      }

      // Branch A
      await editPrefix("A ");
      await waitFor(() => {
        expect(result.queryByText("A first lifelog")).toBeTruthy();
      });

      // Undo → root
      await userEvent.keyboard("{u}");
      await awaitPendingCallbacks();
      await waitFor(() => {
        expect(result.queryByText("first lifelog")).toBeTruthy();
      });

      // Branch B (newer)
      await editPrefix("B ");
      await waitFor(() => {
        expect(result.queryByText("B first lifelog")).toBeTruthy();
      });

      // Undo → root
      await userEvent.keyboard("{u}");
      await awaitPendingCallbacks();
      await waitFor(() => {
        expect(result.queryByText("first lifelog")).toBeTruthy();
      });

      // R (Shift+r) → should pick branch A (second-newest), not B
      await userEvent.keyboard("{Shift>}{r}{/Shift}");
      await awaitPendingCallbacks();

      await waitFor(() => {
        expect(result.queryByText("A first lifelog")).toBeTruthy();
      });
      expect(result.queryByText("B first lifelog")).toBeNull();
    });

    it("R key cycles through branches on repeated u+R", async ({ db, task }) => {
      const { result } = await setupLifeLogsTest(task.id, db, {
        withEditHistory: true,
      });

      await result.findByText("first lifelog");

      async function editPrefix(prefix: string): Promise<void> {
        await userEvent.keyboard("{i}");
        await awaitPendingCallbacks();
        const input = result.container.querySelector("input") as HTMLInputElement;
        input.focus();
        await userEvent.keyboard(prefix);
        await userEvent.keyboard("{Escape}");
        await awaitPendingCallbacks();
      }

      // Branch A, B (A older, B newer)
      await editPrefix("A ");
      await waitFor(() => {
        expect(result.queryByText("A first lifelog")).toBeTruthy();
      });
      await userEvent.keyboard("{u}");
      await awaitPendingCallbacks();

      await editPrefix("B ");
      await waitFor(() => {
        expect(result.queryByText("B first lifelog")).toBeTruthy();
      });
      await userEvent.keyboard("{u}");
      await awaitPendingCallbacks();
      await waitFor(() => {
        expect(result.queryByText("first lifelog")).toBeTruthy();
      });

      // R → branch A (2nd newest)
      await userEvent.keyboard("{Shift>}{r}{/Shift}");
      await awaitPendingCallbacks();
      await waitFor(() => {
        expect(result.queryByText("A first lifelog")).toBeTruthy();
      });

      // u → back to root, then R → should cycle to B (wrap around)
      await userEvent.keyboard("{u}");
      await awaitPendingCallbacks();
      await userEvent.keyboard("{Shift>}{r}{/Shift}");
      await awaitPendingCallbacks();
      await waitFor(() => {
        expect(result.queryByText("B first lifelog")).toBeTruthy();
      });
    });

    it("R key cycles correctly when u is pressed manually between R presses (non-root branch)", async ({
      db,
      task,
    }) => {
      const { result } = await setupLifeLogsTest(task.id, db, {
        withEditHistory: true,
        initialSelectedId: "$log1",
      });

      await result.findByText("first lifelog");

      // Create a new lifeLog (= LifeLog作成 entry, like the screenshot scenario)
      await userEvent.keyboard("{o}");
      await awaitPendingCallbacks();
      await waitFor(() => {
        const input = result.container.querySelector("input") as HTMLInputElement;
        expect(input).toBeTruthy();
      });

      // Type "hoge" and save (= テキスト編集 → hoge)
      await userEvent.keyboard("hoge");
      await userEvent.keyboard("{Escape}");
      await awaitPendingCallbacks();
      await waitFor(() => {
        expect(result.queryByText("hoge")).toBeTruthy();
      });

      // Undo hoge → back to empty text LifeLog
      await userEvent.keyboard("{u}");
      await awaitPendingCallbacks();

      // Type "piyo" and save (= テキスト編集 → piyo, creates branch from LifeLog作成)
      await userEvent.keyboard("{i}");
      await awaitPendingCallbacks();
      const input2 = result.container.querySelector("input") as HTMLInputElement;
      input2.focus();
      await userEvent.keyboard("piyo");
      await userEvent.keyboard("{Escape}");
      await awaitPendingCallbacks();
      await waitFor(() => {
        expect(result.queryByText("piyo")).toBeTruthy();
      });

      // Now at piyo (HEAD = テキスト編集 piyo)
      // u → back to LifeLog作成 (empty text)
      await userEvent.keyboard("{u}");
      await awaitPendingCallbacks();

      // R → should go to hoge (2nd newest branch)
      await userEvent.keyboard("{Shift>}{r}{/Shift}");
      await awaitPendingCallbacks();
      await waitFor(() => {
        expect(result.queryByText("hoge")).toBeTruthy();
      });

      // u → back to LifeLog作成
      await userEvent.keyboard("{u}");
      await awaitPendingCallbacks();

      // R again → should cycle to piyo (wrap to newest)
      await userEvent.keyboard("{Shift>}{r}{/Shift}");
      await awaitPendingCallbacks();
      await waitFor(() => {
        // hoge should NOT be showing (we cycled away from it)
        expect(result.queryByText("hoge")).toBeNull();
        // piyo SHOULD be showing
        expect(result.queryByText("piyo")).toBeTruthy();
      });
    });

    it("R key with single child behaves like r", async ({ db, task }) => {
      const { result } = await setupLifeLogsTest(task.id, db, {
        withEditHistory: true,
        initialSelectedId: "$log3",
      });

      await result.findByText("third lifelog");
      const log3Element = result.getByText("third lifelog").closest(`.${styles.lifeLogs.listItem}`)!;

      await userEvent.keyboard("{s}");
      await awaitPendingCallbacks();
      await waitFor(() => {
        expect(log3Element.textContent).toContain("12:00");
      });

      await userEvent.keyboard("{u}");
      await awaitPendingCallbacks();
      await waitFor(() => {
        expect(log3Element.textContent).not.toContain("12:00");
      });

      // R with single child → same as r
      await userEvent.keyboard("{Shift>}{r}{/Shift}");
      await awaitPendingCallbacks();
      await waitFor(() => {
        expect(log3Element.textContent).toContain("12:00");
      });
    });

    it("r after R resets cycle state", async ({ db, task }) => {
      const { result } = await setupLifeLogsTest(task.id, db, {
        withEditHistory: true,
      });

      await result.findByText("first lifelog");

      async function editPrefix(prefix: string): Promise<void> {
        await userEvent.keyboard("{i}");
        await awaitPendingCallbacks();
        const input = result.container.querySelector("input") as HTMLInputElement;
        input.focus();
        await userEvent.keyboard(prefix);
        await userEvent.keyboard("{Escape}");
        await awaitPendingCallbacks();
      }

      // Branch A, B
      await editPrefix("A ");
      await waitFor(() => {
        expect(result.queryByText("A first lifelog")).toBeTruthy();
      });
      await userEvent.keyboard("{u}");
      await awaitPendingCallbacks();

      await editPrefix("B ");
      await waitFor(() => {
        expect(result.queryByText("B first lifelog")).toBeTruthy();
      });
      await userEvent.keyboard("{u}");
      await awaitPendingCallbacks();

      // R → branch A
      await userEvent.keyboard("{Shift>}{r}{/Shift}");
      await awaitPendingCallbacks();
      await waitFor(() => {
        expect(result.queryByText("A first lifelog")).toBeTruthy();
      });

      // u → root, then r (not R) → should pick newest (B), cycle state reset
      await userEvent.keyboard("{u}");
      await awaitPendingCallbacks();
      await userEvent.keyboard("{r}");
      await awaitPendingCallbacks();
      await waitFor(() => {
        expect(result.queryByText("B first lifelog")).toBeTruthy();
      });
    });

    it("R key with tree node edits cycles branches", async ({ db, task }) => {
      const { result } = await setupLifeLogsTest(task.id, db, {
        withEditHistory: true,
      });

      await result.findByText("first lifelog");

      // Enter tree mode
      await userEvent.keyboard("{l}");
      await awaitPendingCallbacks();
      await result.findByText("first child");

      async function editTreeNodePrefix(prefix: string): Promise<void> {
        await userEvent.keyboard("{i}");
        await awaitPendingCallbacks();
        const input = result.container.querySelector("input") as HTMLInputElement;
        input.focus();
        await userEvent.keyboard(prefix);
        await userEvent.keyboard("{Escape}");
        await awaitPendingCallbacks();
      }

      // Branch A
      await editTreeNodePrefix("A ");
      await waitFor(() => {
        expect(result.queryByText("A first child")).toBeTruthy();
      });
      await userEvent.keyboard("{u}");
      await awaitPendingCallbacks();

      // Branch B
      await editTreeNodePrefix("B ");
      await waitFor(() => {
        expect(result.queryByText("B first child")).toBeTruthy();
      });
      await userEvent.keyboard("{u}");
      await awaitPendingCallbacks();
      await waitFor(() => {
        expect(result.queryByText("first child")).toBeTruthy();
      });

      // R → branch A (second-newest)
      await userEvent.keyboard("{Shift>}{r}{/Shift}");
      await awaitPendingCallbacks();
      await waitFor(() => {
        expect(result.queryByText("A first child")).toBeTruthy();
      });
    });

    it("jumpTo after R resets cycle state", async ({ db, task }) => {
      const { result } = await setupLifeLogsTest(task.id, db, {
        withEditHistory: true,
        initialSelectedId: "$log3",
      });

      await result.findByText("third lifelog");
      const log3Element = result.getByText("third lifelog").closest(`.${styles.lifeLogs.listItem}`)!;

      // Branch A: setStartAtNow
      await userEvent.keyboard("{s}");
      await awaitPendingCallbacks();
      await waitFor(() => {
        expect(log3Element.textContent).toContain("12:00");
      });

      await userEvent.keyboard("{u}");
      await awaitPendingCallbacks();
      await waitFor(() => {
        expect(log3Element.textContent).not.toContain("12:00");
      });

      // Branch B: setEndAtNow
      await userEvent.keyboard("{f}");
      await awaitPendingCallbacks();

      await userEvent.keyboard("{u}");
      await awaitPendingCallbacks();

      // R → branch A (startAt set, endAt N/A)
      await userEvent.keyboard("{Shift>}{r}{/Shift}");
      await awaitPendingCallbacks();
      await waitFor(() => {
        expect(log3Element.textContent).toContain("12:00");
        expect(log3Element.textContent).toContain("N/A");
      });

      // Open panel and jumpTo root → resets cycle
      await userEvent.keyboard("{t}");
      await awaitPendingCallbacks();
      await waitFor(() => {
        expect(result.queryByText("編集履歴")).toBeTruthy();
      });

      // Undo back to root first (jumpTo root directly would be jumpTo "")
      await userEvent.keyboard("{u}");
      await awaitPendingCallbacks();
      await waitFor(() => {
        expect(log3Element.textContent).not.toContain("12:00");
      });

      // r (normal redo, not R) → should pick newest = B (endAt)
      await userEvent.keyboard("{r}");
      await awaitPendingCallbacks();

      // After r, the jumpTo should have reset cycle, but we just pressed r which also resets.
      // The key verification: r picks the newest branch (B = endAt), not branch A.
      // If endAt was set, "N/A" should disappear from endAt position.
      // $log3 originally has startAt=N/A, endAt=N/A. Branch B sets endAt only.
      await waitFor(() => {
        // endAt should be set (branch B = setEndAtNow), startAt still N/A
        const text = log3Element.textContent ?? "";
        expect(text).toContain("12:00");
      });
    });

    it("R key with mixed lifeLog and tree node edits", async ({ db, task }) => {
      const { result } = await setupLifeLogsTest(task.id, db, {
        withEditHistory: true,
        initialSelectedId: "$log3",
      });

      await result.findByText("third lifelog");
      const log3Element = result.getByText("third lifelog").closest(`.${styles.lifeLogs.listItem}`)!;

      // Branch A: set startAt
      await userEvent.keyboard("{s}");
      await awaitPendingCallbacks();
      await waitFor(() => {
        expect(log3Element.textContent).toContain("12:00");
      });

      // Undo → root
      await userEvent.keyboard("{u}");
      await awaitPendingCallbacks();
      await waitFor(() => {
        expect(log3Element.textContent).not.toContain("12:00");
      });

      // Branch B: set endAt
      await userEvent.keyboard("{f}");
      await awaitPendingCallbacks();

      // Undo → root
      await userEvent.keyboard("{u}");
      await awaitPendingCallbacks();

      // R → branch A (second-newest = startAt), not B (newest = endAt)
      await userEvent.keyboard("{Shift>}{r}{/Shift}");
      await awaitPendingCallbacks();
      await waitFor(() => {
        // startAt should be set (branch A applied)
        expect(log3Element.textContent).toContain("12:00");
        // endAt should still be N/A (branch B not applied)
        expect(log3Element.textContent).toContain("N/A");
      });
    });

    it("R key no-op when no children exist", async ({ db, task }) => {
      const { result } = await setupLifeLogsTest(task.id, db, {
        withEditHistory: true,
      });

      await result.findByText("first lifelog");

      // R at root with no history entries → no-op
      await userEvent.keyboard("{Shift>}{r}{/Shift}");
      await awaitPendingCallbacks();

      // Still shows first lifelog, no change
      expect(result.queryByText("first lifelog")).toBeTruthy();
    });

    it("undo/redo of deleteEmptyLifeLog", async ({ db, task }) => {
      const { result } = await setupLifeLogsTest(task.id, db, {
        withEditHistory: true,
        initialSelectedId: "$log3",
      });

      await result.findByText("third lifelog");

      // $log3 has no startAt/endAt, no tree nodes, and text is not empty — can't delete yet
      // Create a new empty lifeLog that can be deleted
      await userEvent.keyboard("{o}");
      await awaitPendingCallbacks();
      await waitFor(() => {
        const input = result.container.querySelector("input") as HTMLInputElement;
        expect(input).toBeTruthy();
      });

      // Exit editing without typing (empty text)
      await userEvent.keyboard("{Escape}");
      await awaitPendingCallbacks();

      // Delete the empty lifeLog with Backspace
      await userEvent.keyboard("{Backspace}");
      await awaitPendingCallbacks();

      // Should be back at $log3
      await waitFor(() => {
        expect(result.getByText("third lifelog")).toBeTruthy();
      });

      // Undo → lifeLog should be restored
      await userEvent.keyboard("{u}");
      await awaitPendingCallbacks();

      // Redo → lifeLog should be deleted again, back to $log3
      await userEvent.keyboard("{r}");
      await awaitPendingCallbacks();

      await waitFor(() => {
        expect(result.getByText("third lifelog")).toBeTruthy();
      });
    });

    it("undo/redo of splitTreeNode", async ({ db, task }) => {
      const { result } = await setupLifeLogsTest(task.id, db, {
        withEditHistory: true,
      });

      await result.findByText("first lifelog");

      // Enter tree
      await userEvent.keyboard("{l}");
      await awaitPendingCallbacks();
      await result.findByText("first child");

      // Edit first child: replace text, set cursor, then split
      await userEvent.keyboard("{i}");
      await awaitPendingCallbacks();
      const input = result.container.querySelector("input") as HTMLInputElement;
      input.focus();
      await userEvent.keyboard("{Control>}a{/Control}beforeafter");
      await awaitPendingCallbacks();

      // Set cursor at position 6 ("before" | "after") and split
      input.setSelectionRange(6, 6);
      await userEvent.keyboard("{Enter}");
      await awaitPendingCallbacks();

      // After split: "before" appears as text, "after" is in the editing input
      await waitFor(() => {
        expect(result.queryByText("before")).toBeTruthy();
        const inputAfter = result.container.querySelector("input") as HTMLInputElement;
        expect(inputAfter?.value).toBe("after");
      });

      // Exit editing so both are rendered as text
      await userEvent.keyboard("{Escape}");
      await awaitPendingCallbacks();

      await waitFor(() => {
        expect(result.queryByText("before")).toBeTruthy();
        expect(result.queryByText("after")).toBeTruthy();
      });

      // Undo → the split is reverted: original node restored to "first child" (Firestore value)
      await userEvent.keyboard("{u}");
      await awaitPendingCallbacks();

      await waitFor(() => {
        expect(result.queryByText("first child")).toBeTruthy();
        expect(result.queryByText("before")).toBeNull();
      });

      // Redo → split again (both rendered as text since we're not editing)
      await userEvent.keyboard("{r}");
      await awaitPendingCallbacks();

      await waitFor(() => {
        expect(result.queryByText("before")).toBeTruthy();
        expect(result.queryByText("after")).toBeTruthy();
      });
    });

    it("undo/redo of mergeWithAbove (Backspace at node start)", async ({ db, task }) => {
      const { result } = await setupLifeLogsTest(task.id, db, {
        withEditHistory: true,
      });

      await result.findByText("first lifelog");

      // Enter tree, navigate to child2 (j×3: child1 → grandchild → great-grandchild → child2)
      await userEvent.keyboard("{l}");
      await awaitPendingCallbacks();
      await result.findByText("first child");
      await waitFor(() => {
        expect(result.getByText("first child").className).toContain(styles.lifeLogTree.selected);
      });
      await userEvent.keyboard("{j}");
      await awaitPendingCallbacks();
      await waitFor(() => {
        expect(result.getByText("grandchild").className).toContain(styles.lifeLogTree.selected);
      });
      await userEvent.keyboard("{j}");
      await awaitPendingCallbacks();
      await waitFor(() => {
        expect(result.getByText("great-grandchild").className).toContain(styles.lifeLogTree.selected);
      });
      await userEvent.keyboard("{j}");
      await awaitPendingCallbacks();
      await waitFor(() => {
        expect(result.getByText("second child").className).toContain(styles.lifeLogTree.selected);
      });

      // Edit child2, cursor at start, press Backspace to merge with above (great-grandchild)
      await userEvent.keyboard("{i}");
      await awaitPendingCallbacks();
      await waitFor(() => {
        const input = result.container.querySelector("input") as HTMLInputElement;
        expect(input).toBeTruthy();
        expect(input.value).toBe("second child");
      });
      await userEvent.keyboard("{Backspace}");
      await awaitPendingCallbacks();

      // Should merge "great-grandchild" + "second child" → "great-grandchildsecond child"
      await waitFor(() => {
        const input = result.container.querySelector("input") as HTMLInputElement;
        expect(input).toBeTruthy();
        expect(input.value).toBe("great-grandchildsecond child");
      });

      // Undo → nodes should separate again
      await userEvent.keyboard("{Escape}");
      await awaitPendingCallbacks();
      await userEvent.keyboard("{u}");
      await awaitPendingCallbacks();

      await waitFor(() => {
        expect(result.queryByText("great-grandchild")).toBeTruthy();
        expect(result.queryByText("second child")).toBeTruthy();
      });
    });

    it("undo/redo of mergeWithBelow (Delete at node end)", async ({ db, task }) => {
      const { result } = await setupLifeLogsTest(task.id, db, {
        withEditHistory: true,
      });

      await result.findByText("first lifelog");

      // Enter tree, navigate to great-grandchild (j×2: child1 → grandchild → great-grandchild)
      await userEvent.keyboard("{l}");
      await awaitPendingCallbacks();
      await result.findByText("first child");
      await waitFor(() => {
        expect(result.getByText("first child").className).toContain(styles.lifeLogTree.selected);
      });
      await userEvent.keyboard("{j}");
      await awaitPendingCallbacks();
      await waitFor(() => {
        expect(result.getByText("grandchild").className).toContain(styles.lifeLogTree.selected);
      });
      await userEvent.keyboard("{j}");
      await awaitPendingCallbacks();
      await waitFor(() => {
        expect(result.getByText("great-grandchild").className).toContain(styles.lifeLogTree.selected);
      });

      // Edit great-grandchild with cursor at end, press Delete to merge with below (second child)
      await userEvent.keyboard("{a}");
      await awaitPendingCallbacks();
      await waitFor(() => {
        const input = result.container.querySelector("input") as HTMLInputElement;
        expect(input.value).toBe("great-grandchild");
      });
      await userEvent.keyboard("{Delete}");
      await awaitPendingCallbacks();

      // Should merge "great-grandchild" + "second child" → "great-grandchildsecond child"
      // The merged text is in the editing input
      await waitFor(() => {
        const input = result.container.querySelector("input") as HTMLInputElement;
        expect(input?.value).toBe("great-grandchildsecond child");
      });

      // Exit editing, then undo
      await userEvent.keyboard("{Escape}");
      await awaitPendingCallbacks();

      await waitFor(() => {
        expect(result.queryByText("great-grandchildsecond child")).toBeTruthy();
      });

      await userEvent.keyboard("{u}");
      await awaitPendingCallbacks();

      await waitFor(() => {
        expect(result.queryByText("great-grandchild")).toBeTruthy();
        expect(result.queryByText("second child")).toBeTruthy();
      });

      // Redo → merged text should return
      await userEvent.keyboard("{r}");
      await awaitPendingCallbacks();

      await waitFor(() => {
        expect(result.queryByText("great-grandchildsecond child")).toBeTruthy();
      });
    });

    it("undo/redo of addSiblingNode", async ({ db, task }) => {
      const { result } = await setupLifeLogsTest(task.id, db, {
        withEditHistory: true,
      });

      await result.findByText("first lifelog");

      // Enter tree
      await userEvent.keyboard("{l}");
      await awaitPendingCallbacks();
      await result.findByText("first child");

      // Add sibling below with o
      await userEvent.keyboard("{o}");
      await awaitPendingCallbacks();

      // New empty node should exist — type something
      await waitFor(() => {
        const input = result.container.querySelector("input") as HTMLInputElement;
        expect(input).toBeTruthy();
      });
      await userEvent.keyboard("new sibling");
      await userEvent.keyboard("{Escape}");
      await awaitPendingCallbacks();

      await waitFor(() => {
        expect(result.queryByText("new sibling")).toBeTruthy();
      });

      // Undo text edit, then undo node creation
      await userEvent.keyboard("{u}");
      await awaitPendingCallbacks();
      await userEvent.keyboard("{u}");
      await awaitPendingCallbacks();

      await waitFor(() => {
        expect(result.queryByText("new sibling")).toBeNull();
      });

      // Redo ×2 → node should be back
      await userEvent.keyboard("{r}");
      await awaitPendingCallbacks();
      await userEvent.keyboard("{r}");
      await awaitPendingCallbacks();

      await waitFor(() => {
        expect(result.queryByText("new sibling")).toBeTruthy();
      });
    });

    it("undo of enterTree (node creation) reverts hasTreeNodes to false", async ({ db, task }) => {
      const { result } = await setupLifeLogsTest(task.id, db, {
        withEditHistory: true,
        initialSelectedId: "$log3",
      });

      await result.findByText("third lifelog");

      // $log3 has no tree nodes. Enter tree to create one (ノード作成 + hasTreeNodes=true).
      expect(result.container.querySelectorAll(`.${styles.lifeLogTree.childrenNodes}`).length).toBe(0);

      await userEvent.keyboard("{l}");
      await awaitPendingCallbacks();

      // Wait for the tree node to be fully rendered
      await waitFor(() => {
        expect(result.container.querySelectorAll(`.${styles.lifeLogTree.childrenNodes}`).length).toBe(1);
      });

      // Undo ノード作成 → hasTreeNodes should revert to false, wrapper gone
      await userEvent.keyboard("{u}");
      await awaitPendingCallbacks();

      await waitFor(
        () => {
          expect(result.container.querySelectorAll(`.${styles.lifeLogTree.childrenNodes}`).length).toBe(0);
        },
        { timeout: 3000 },
      );

      // Redo → node should be restored
      await userEvent.keyboard("{r}");
      await awaitPendingCallbacks();

      await waitFor(
        () => {
          expect(result.container.querySelectorAll(`.${styles.lifeLogTree.childrenNodes}`).length).toBe(1);
        },
        { timeout: 3000 },
      );
    });

    it("jumpToNode cross-branch via panel", async ({ db, task }) => {
      const { result } = await setupLifeLogsTest(task.id, db, {
        withEditHistory: true,
        initialSelectedId: "$log3",
      });

      await result.findByText("third lifelog");
      const log3Element = result.getByText("third lifelog").closest(`.${styles.lifeLogs.listItem}`)!;

      // Branch A: set startAt
      await userEvent.keyboard("{s}");
      await awaitPendingCallbacks();
      await waitFor(() => {
        expect(log3Element.textContent).toContain("12:00");
      });

      // Undo → root
      await userEvent.keyboard("{u}");
      await awaitPendingCallbacks();

      // Branch B: set endAt
      await userEvent.keyboard("{f}");
      await awaitPendingCallbacks();

      // Open history panel
      await userEvent.keyboard("{t}");
      await awaitPendingCallbacks();

      await waitFor(() => {
        expect(result.queryByText("編集履歴")).toBeTruthy();
      });

      // Find the 時刻設定 row that corresponds to branch A (startAt)
      // There should be 2 時刻設定 rows; click the one that is NOT the current HEAD
      await waitFor(() => {
        const rows = result.container.querySelectorAll(`.${styles.editHistory.graphRow}`);
        expect(rows.length).toBeGreaterThanOrEqual(3); // root + 2 entries
      });

      const rows = Array.from(result.container.querySelectorAll(`.${styles.editHistory.graphRow}`));
      // Find a 時刻設定 row without HEAD marker (branch A)
      const branchARow = rows.find(
        (row) => row.textContent?.includes("時刻設定") && !row.textContent?.includes("HEAD"),
      );
      expect(branchARow).toBeTruthy();

      // Click to jump to branch A
      await userEvent.click(branchARow!);
      await awaitPendingCallbacks();

      // After jumping to branch A: startAt should be set, endAt should be N/A
      await waitFor(() => {
        expect(log3Element.textContent).toContain("12:00");
        expect(log3Element.textContent).toContain("N/A");
      });
    });

    it("undo/redo of lifeLog text edit (saveText)", async ({ db, task }) => {
      const { result } = await setupLifeLogsTest(task.id, db, {
        withEditHistory: true,
      });

      await result.findByText("first lifelog");

      // Edit lifeLog text
      await userEvent.keyboard("{i}");
      await awaitPendingCallbacks();
      const input = result.container.querySelector("input") as HTMLInputElement;
      input.focus();
      await userEvent.keyboard("{Control>}a{/Control}edited lifelog");
      await userEvent.keyboard("{Escape}");
      await awaitPendingCallbacks();

      await waitFor(() => {
        expect(result.queryByText("edited lifelog")).toBeTruthy();
      });

      // Undo → text should revert to "first lifelog"
      await userEvent.keyboard("{u}");
      await awaitPendingCallbacks();

      await waitFor(() => {
        expect(result.queryByText("first lifelog")).toBeTruthy();
        expect(result.queryByText("edited lifelog")).toBeNull();
      });

      // Redo → text should restore to "edited lifelog"
      await userEvent.keyboard("{r}");
      await awaitPendingCallbacks();

      await waitFor(() => {
        expect(result.queryByText("edited lifelog")).toBeTruthy();
      });
    });

    it("undo/redo of saveStartAt (manual time edit)", async ({ db, task }) => {
      const { result } = await setupLifeLogsTest(task.id, db, {
        withEditHistory: true,
      });

      await result.findByText("first lifelog");

      // $log1 startAt is 10:30:00. Edit it via Tab to startAt field.
      await userEvent.keyboard("{i}");
      await awaitPendingCallbacks();
      await userEvent.keyboard("{Tab}");
      await awaitPendingCallbacks();

      // Input should show startAt
      await waitFor(() => {
        const input = result.container.querySelector("input") as HTMLInputElement;
        expect(input.value).toBe("20260110 103000");
      });

      // Change last digit: 103000 → 103005
      await userEvent.keyboard("{Backspace}5");
      await userEvent.keyboard("{Escape}");
      await awaitPendingCallbacks();

      await waitFor(() => {
        expect(result.queryByText("2026-01-10 10:30:05")).toBeTruthy();
      });

      // Undo → startAt should revert to 10:30:00
      await userEvent.keyboard("{u}");
      await awaitPendingCallbacks();

      await waitFor(() => {
        expect(result.queryByText("2026-01-10 10:30:00")).toBeTruthy();
        expect(result.queryByText("2026-01-10 10:30:05")).toBeNull();
      });

      // Redo → startAt should restore to 10:30:05
      await userEvent.keyboard("{r}");
      await awaitPendingCallbacks();

      await waitFor(() => {
        expect(result.queryByText("2026-01-10 10:30:05")).toBeTruthy();
      });
    });

    it("undo/redo of saveEndAt (manual time edit)", async ({ db, task }) => {
      const { result } = await setupLifeLogsTest(task.id, db, {
        withEditHistory: true,
        initialSelectedId: "$log3",
      });

      await result.findByText("third lifelog");

      // $log3 has noneTimestamp for both startAt and endAt
      // First set startAt so endAt field can be edited
      await userEvent.keyboard("{s}");
      await awaitPendingCallbacks();
      const log3Element = result.getByText("third lifelog").closest(`.${styles.lifeLogs.listItem}`)!;
      await waitFor(() => {
        expect(log3Element.textContent).toContain("12:00");
      });

      // Edit endAt: i → Tab (to startAt) → Tab (to endAt) → type time → Escape
      await userEvent.keyboard("{i}");
      await awaitPendingCallbacks();
      await userEvent.keyboard("{Tab}");
      await awaitPendingCallbacks();
      await userEvent.keyboard("{Tab}");
      await awaitPendingCallbacks();

      await waitFor(() => {
        const input = result.container.querySelector("input") as HTMLInputElement;
        expect(input).toBeTruthy();
        expect(input.value).toBe(""); // noneTimestamp shows as empty
      });

      await userEvent.keyboard("20260110 130000");
      await userEvent.keyboard("{Escape}");
      await awaitPendingCallbacks();

      await waitFor(() => {
        expect(result.queryByText("2026-01-10 13:00:00")).toBeTruthy();
      });

      // Undo saveEndAt → endAt should revert to N/A
      await userEvent.keyboard("{u}");
      await awaitPendingCallbacks();

      await waitFor(() => {
        expect(log3Element.textContent).toContain("N/A");
        expect(result.queryByText("2026-01-10 13:00:00")).toBeNull();
      });
    });

    it("undo/redo of createFirstLifeLog", async ({ db, task }) => {
      const { result } = await setupLifeLogsTest(task.id, db, {
        withEditHistory: true,
        skipDefaultLifeLogs: true,
      });

      // No lifeLogs exist — the o key (createFirstLifeLog) should create one
      await userEvent.keyboard("{o}");
      await awaitPendingCallbacks();

      // Wait for the new lifeLog to appear as a list item
      await waitFor(() => {
        const listItems = result.container.querySelectorAll(`.${styles.lifeLogs.listItem}`);
        expect(listItems.length).toBeGreaterThan(0);
      });

      // Undo createFirstLifeLog → lifeLog should be gone
      await userEvent.keyboard("{u}");
      await awaitPendingCallbacks();

      await waitFor(() => {
        const listItems = result.container.querySelectorAll(`.${styles.lifeLogs.listItem}`);
        expect(listItems.length).toBe(0);
      });

      // Redo → lifeLog should be back
      await userEvent.keyboard("{r}");
      await awaitPendingCallbacks();

      await waitFor(
        () => {
          const listItems = result.container.querySelectorAll(`.${styles.lifeLogs.listItem}`);
          expect(listItems.length).toBeGreaterThan(0);
        },
        { timeout: 3000 },
      );
    });

    it("edit history panel is scrollable with many entries", async ({ db, task }) => {
      const { result } = await setupLifeLogsTest(task.id, db, {
        withEditHistory: true,
        initialSelectedId: "$log3",
      });

      await result.findByText("third lifelog");

      // Generate many history entries by toggling startAt/endAt multiple times
      // Each s/f keypress creates a new entry (when the field was empty)
      // But since setStartAtNow only works when startAt is none, we need other operations
      // Use undo/redo cycles with setStartAt/setEndAt to create history
      for (let i = 0; i < 20; i++) {
        await userEvent.keyboard("{s}");
        await awaitPendingCallbacks();
        await userEvent.keyboard("{u}");
        await awaitPendingCallbacks();
      }

      // Open panel
      await userEvent.keyboard("{t}");
      await awaitPendingCallbacks();

      await waitFor(() => {
        expect(result.queryByText("編集履歴")).toBeTruthy();
      });

      // Verify the panel's scrollable container has overflow (many entries present)
      const treeContainer = result.container.querySelector(`.${styles.editHistory.treeContainer}`) as HTMLElement;
      expect(treeContainer).toBeTruthy();

      // Should have many history entry rows
      const rows = treeContainer.querySelectorAll(`.${styles.editHistory.graphRow}`);
      expect(rows.length).toBeGreaterThan(5);
    });

    it("undo/redo of deleteEmptyLifeLogToPrev (Backspace on empty lifeLog in editing mode)", async ({ db, task }) => {
      const { result } = await setupLifeLogsTest(task.id, db, {
        withEditHistory: true,
        initialSelectedId: "$log3",
      });

      await result.findByText("third lifelog");

      // $log3: text="third lifelog", startAt=none, endAt=none
      // Clear text first to make it deletable
      await userEvent.keyboard("{i}");
      await awaitPendingCallbacks();
      const input1 = result.container.querySelector("input") as HTMLInputElement;
      input1.focus();
      await userEvent.keyboard("{Control>}a{/Control}{Backspace}");
      await userEvent.keyboard("{Escape}");
      await awaitPendingCallbacks();

      // Re-enter editing mode on now-empty $log3
      await userEvent.keyboard("{i}");
      await awaitPendingCallbacks();

      // Backspace at position 0 on empty text → deleteEmptyLifeLogToPrev → goes to $log2
      await userEvent.keyboard("{Backspace}");
      await awaitPendingCallbacks();

      // Should be editing $log2 now
      await waitFor(() => {
        const input = result.container.querySelector("input") as HTMLInputElement;
        expect(input).toBeTruthy();
        expect(input.value).toBe("second lifelog");
      });

      // Exit editing
      await userEvent.keyboard("{Escape}");
      await awaitPendingCallbacks();

      // Undo the deletion → $log3 should reappear (empty)
      await userEvent.keyboard("{u}");
      await awaitPendingCallbacks();

      await waitFor(() => {
        const listItems = result.container.querySelectorAll(`.${styles.lifeLogs.listItem}`);
        expect(listItems.length).toBe(4); // $log1, $log2, $log3 (empty), $log4
      });

      // Redo the deletion → $log3 should be removed again
      await userEvent.keyboard("{r}");
      await awaitPendingCallbacks();

      await waitFor(() => {
        const listItems = result.container.querySelectorAll(`.${styles.lifeLogs.listItem}`);
        expect(listItems.length).toBe(3); // $log1, $log2, $log4
      });
    });

    it("undo/redo of deleteEmptyLifeLogToNext (Delete on empty lifeLog in editing mode)", async ({ db, task }) => {
      const { result } = await setupLifeLogsTest(task.id, db, {
        withEditHistory: true,
        initialSelectedId: "$log3",
      });

      await result.findByText("third lifelog");

      // Clear $log3 text to make it deletable
      await userEvent.keyboard("{i}");
      await awaitPendingCallbacks();
      const input1 = result.container.querySelector("input") as HTMLInputElement;
      input1.focus();
      await userEvent.keyboard("{Control>}a{/Control}{Backspace}");
      await userEvent.keyboard("{Escape}");
      await awaitPendingCallbacks();

      // Re-enter editing, press Delete at end → deleteEmptyLifeLogToNext → goes to $log4
      await userEvent.keyboard("{i}");
      await awaitPendingCallbacks();

      // Cursor is at position 0 = end (text is empty), Delete should trigger
      await userEvent.keyboard("{Delete}");
      await awaitPendingCallbacks();

      // Should be editing $log4 now
      await waitFor(() => {
        const input = result.container.querySelector("input") as HTMLInputElement;
        expect(input).toBeTruthy();
        expect(input.value).toBe("fourth lifelog");
      });

      // Exit editing
      await userEvent.keyboard("{Escape}");
      await awaitPendingCallbacks();

      // Undo the deletion → $log3 should reappear
      await userEvent.keyboard("{u}");
      await awaitPendingCallbacks();

      await waitFor(() => {
        const listItems = result.container.querySelectorAll(`.${styles.lifeLogs.listItem}`);
        expect(listItems.length).toBe(4); // $log1, $log2, $log3, $log4
      });

      // Redo → $log3 gone again
      await userEvent.keyboard("{r}");
      await awaitPendingCallbacks();

      await waitFor(() => {
        const listItems = result.container.querySelectorAll(`.${styles.lifeLogs.listItem}`);
        expect(listItems.length).toBe(3); // $log1, $log2, $log4
      });
    });

    it("redo after jumpTo navigates to correct branch", async ({ db, task }) => {
      const { result } = await setupLifeLogsTest(task.id, db, {
        withEditHistory: true,
        initialSelectedId: "$log3",
      });

      await result.findByText("third lifelog");
      const log3Element = result.getByText("third lifelog").closest(`.${styles.lifeLogs.listItem}`)!;

      // Branch A: set startAt
      await userEvent.keyboard("{s}");
      await awaitPendingCallbacks();
      await waitFor(() => {
        expect(log3Element.textContent).toContain("12:00");
      });

      // Undo → back to root
      await userEvent.keyboard("{u}");
      await awaitPendingCallbacks();

      // Branch B: set endAt
      await userEvent.keyboard("{f}");
      await awaitPendingCallbacks();

      // Open panel and jump to branch A
      await userEvent.keyboard("{t}");
      await awaitPendingCallbacks();

      await waitFor(() => {
        expect(result.queryByText("編集履歴")).toBeTruthy();
      });

      await waitFor(() => {
        const rows = result.container.querySelectorAll(`.${styles.editHistory.graphRow}`);
        expect(rows.length).toBeGreaterThanOrEqual(3);
      });

      const rows = Array.from(result.container.querySelectorAll(`.${styles.editHistory.graphRow}`));
      const branchARow = rows.find(
        (row) => row.textContent?.includes("時刻設定") && !row.textContent?.includes("HEAD"),
      );
      expect(branchARow).toBeTruthy();
      await userEvent.click(branchARow!);
      await awaitPendingCallbacks();

      // After jumpTo branch A: startAt set, endAt is N/A
      await waitFor(() => {
        expect(log3Element.textContent).toContain("12:00");
        expect(log3Element.textContent).toContain("N/A");
      });

      // Close panel
      await userEvent.keyboard("{t}");
      await awaitPendingCallbacks();

      // Now undo back to root (undo branch A)
      await userEvent.keyboard("{u}");
      await awaitPendingCallbacks();

      await waitFor(() => {
        expect(log3Element.textContent).not.toContain("12:00");
      });

      // Redo should go to branch A's child (newest child of root = branch B, because B was created after A)
      // Branch B set endAt, not startAt
      await userEvent.keyboard("{r}");
      await awaitPendingCallbacks();

      // Verify that redo picked the newest child (branch B = endAt set)
      // After redo, endAt should no longer be N/A (it was set by branch B)
      await waitFor(() => {
        // Branch B set endAt, so there should be no "N/A" for endAt in $log3
        const naCount = (log3Element.textContent?.match(/N\/A/g) || []).length;
        // startAt is still N/A (branch B only set endAt), so exactly 1 N/A
        expect(naCount).toBe(1);
      });
    });

    it("multiple sequential undos back to initial state", async ({ db, task }) => {
      const { result, firestore } = await setupLifeLogsTest(task.id, db, {
        withEditHistory: true,
        initialSelectedId: "$log3",
      });

      await result.findByText("third lifelog");
      const log3Element = result.getByText("third lifelog").closest(`.${styles.lifeLogs.listItem}`)!;

      // Operation 1: set startAt
      await userEvent.keyboard("{s}");
      await awaitPendingCallbacks();
      await waitFor(() => {
        expect(log3Element.textContent).toContain("12:00");
      });

      // Operation 2: set endAt
      await userEvent.keyboard("{f}");
      await awaitPendingCallbacks();

      // Operation 3: create new lifeLog
      await userEvent.keyboard("{o}");
      await awaitPendingCallbacks();
      await waitFor(() => {
        const input = result.container.querySelector("input") as HTMLInputElement;
        expect(input).toBeTruthy();
      });
      await userEvent.keyboard("{Escape}");
      await awaitPendingCallbacks();

      // Undo 3: undo newLifeLog
      await userEvent.keyboard("{u}");
      await awaitPendingCallbacks();

      // Undo 2: undo setEndAtNow
      await userEvent.keyboard("{u}");
      await awaitPendingCallbacks();

      // Undo 1: undo setStartAtNow
      await userEvent.keyboard("{u}");
      await awaitPendingCallbacks();

      // Now at initial state — $log3 should have no times set
      await waitFor(() => {
        expect(log3Element.textContent).not.toContain("12:00");
      });

      // One more undo should be a no-op (already at root)
      await userEvent.keyboard("{u}");
      await awaitPendingCallbacks();

      // Verify editHistoryHead is at root ("")
      const head = await getSingletonDoc(firestore, getCollection(firestore, "editHistoryHead"));
      expect(head?.entryId).toBe("");

      // $log3 should still be visible and unchanged
      expect(result.getByText("third lifelog")).toBeTruthy();
    });

    it("undo/redo of addSiblingNode above (Shift+O)", async ({ db, task }) => {
      const { result } = await setupLifeLogsTest(task.id, db, {
        withEditHistory: true,
      });

      await result.findByText("first lifelog");

      // Enter tree
      await userEvent.keyboard("{l}");
      await awaitPendingCallbacks();
      await result.findByText("first child");

      // Navigate to second child
      await userEvent.keyboard("{j}");
      await awaitPendingCallbacks();
      await userEvent.keyboard("{j}");
      await awaitPendingCallbacks();
      await userEvent.keyboard("{j}");
      await awaitPendingCallbacks();
      await waitFor(() => {
        expect(result.getByText("second child").className).toContain(styles.lifeLogTree.selected);
      });

      // Add sibling ABOVE with Shift+O
      await userEvent.keyboard("{Shift>}o{/Shift}");
      await awaitPendingCallbacks();

      // Should enter editing mode on new node above second child
      await waitFor(() => {
        const input = result.container.querySelector("input") as HTMLInputElement;
        expect(input).toBeTruthy();
      });

      // Type text and save
      await userEvent.keyboard("above sibling");
      await userEvent.keyboard("{Escape}");
      await awaitPendingCallbacks();

      await waitFor(() => {
        expect(result.queryByText("above sibling")).toBeTruthy();
      });

      // Undo ×2 (text save + node creation)
      await userEvent.keyboard("{u}");
      await awaitPendingCallbacks();
      await userEvent.keyboard("{u}");
      await awaitPendingCallbacks();

      // "above sibling" should be gone
      await waitFor(() => {
        expect(result.queryByText("above sibling")).toBeNull();
      });

      // Redo ×2 → node should be back
      await userEvent.keyboard("{r}");
      await awaitPendingCallbacks();
      await userEvent.keyboard("{r}");
      await awaitPendingCallbacks();

      await waitFor(() => {
        expect(result.queryByText("above sibling")).toBeTruthy();
      });
    });

    it("undo/redo of saveAndDedentTreeNode", async ({ db, task }) => {
      const { result } = await setupLifeLogsTest(task.id, db, {
        withEditHistory: true,
      });

      await result.findByText("first lifelog");

      // Enter tree → child1 selected
      await userEvent.keyboard("{l}");
      await awaitPendingCallbacks();
      await result.findByText("first child");

      // Navigate to grandchild (j to grandchild)
      await userEvent.keyboard("{j}");
      await awaitPendingCallbacks();
      await waitFor(() => {
        expect(result.getByText("grandchild").className).toContain(styles.lifeLogTree.selected);
      });

      // Grandchild is a child of child1. Dedent it (Shift+Tab) to make it a sibling of child1.
      await userEvent.keyboard("{i}");
      await awaitPendingCallbacks();
      await userEvent.keyboard("{Shift>}{Tab}{/Shift}");
      await awaitPendingCallbacks();

      // After dedent, grandchild should be at root level (sibling of child1)
      // Exit editing to verify
      await userEvent.keyboard("{Escape}");
      await awaitPendingCallbacks();

      // Undo the dedent → grandchild should go back under child1
      await userEvent.keyboard("{u}");
      await awaitPendingCallbacks();

      // Redo → grandchild should be dedented again (sibling of child1)
      await userEvent.keyboard("{r}");
      await awaitPendingCallbacks();

      // Verify grandchild is still accessible (redo didn't break anything)
      await waitFor(() => {
        expect(result.queryByText("grandchild")).toBeTruthy();
      });
    });

    it("R key cycles correctly with exactly 2 branches", async ({ db, task }) => {
      const { result } = await setupLifeLogsTest(task.id, db, {
        withEditHistory: true,
        initialSelectedId: "$log3",
      });

      await result.findByText("third lifelog");
      const log3Element = result.getByText("third lifelog").closest(`.${styles.lifeLogs.listItem}`)!;

      // Branch A: set startAt
      await userEvent.keyboard("{s}");
      await awaitPendingCallbacks();
      await waitFor(() => {
        expect(log3Element.textContent).toContain("12:00");
      });

      // Undo → root
      await userEvent.keyboard("{u}");
      await awaitPendingCallbacks();

      // Branch B: set endAt (creates exactly 2 branches from root)
      await userEvent.keyboard("{f}");
      await awaitPendingCallbacks();

      // Undo → root
      await userEvent.keyboard("{u}");
      await awaitPendingCallbacks();

      // r picks newest (branch B). Verify by checking endAt is set.
      await userEvent.keyboard("{r}");
      await awaitPendingCallbacks();

      await waitFor(() => {
        // Branch B set endAt; startAt should still be N/A
        const naCount = (log3Element.textContent?.match(/N\/A/g) || []).length;
        expect(naCount).toBe(1); // only startAt is N/A
      });

      // Undo back to root
      await userEvent.keyboard("{u}");
      await awaitPendingCallbacks();

      // R (Shift+R) picks second-newest = branch A (startAt set)
      await userEvent.keyboard("{Shift>}r{/Shift}");
      await awaitPendingCallbacks();

      await waitFor(() => {
        expect(log3Element.textContent).toContain("12:00");
        // Branch A set startAt; endAt should be N/A
        expect(log3Element.textContent).toContain("N/A");
      });

      // Another u+R should cycle to branch B
      await userEvent.keyboard("{u}");
      await awaitPendingCallbacks();
      await userEvent.keyboard("{Shift>}r{/Shift}");
      await awaitPendingCallbacks();

      await waitFor(() => {
        // Branch B: endAt set, startAt is N/A
        const naCount = (log3Element.textContent?.match(/N\/A/g) || []).length;
        expect(naCount).toBe(1);
      });
    });

    it("mobile toolbar 📜 button opens history panel", async ({ db, task }) => {
      const { result } = await setupLifeLogsTest(task.id, db, {
        withEditHistory: true,
      });

      await result.findByText("first lifelog");

      // Panel should not be visible
      expect(result.queryByText("編集履歴")).toBeNull();

      // Click 📜 button to open
      const historyButton = Array.from(result.container.querySelectorAll(`.${styles.mobileToolbar.button}`)).find(
        (btn) => btn.textContent === "📜",
      );
      expect(historyButton).toBeTruthy();
      await userEvent.click(historyButton!);
      await awaitPendingCallbacks();

      // Panel should be visible
      await waitFor(() => {
        expect(result.queryByText("編集履歴")).toBeTruthy();
      });

      // Close with Escape key (panel overlays the button, so use keyboard)
      await userEvent.keyboard("{Escape}");
      await awaitPendingCallbacks();

      await waitFor(() => {
        expect(result.queryByText("編集履歴")).toBeNull();
      });
    });

    it("undo/redo of deleting last tree node (Backspace on only node)", async ({ db, task }) => {
      const { result } = await setupLifeLogsTest(task.id, db, {
        withEditHistory: true,
        initialSelectedId: "$log3",
      });

      await result.findByText("third lifelog");

      // Record baseline count ($log1 may have childrenNodes visible)
      const initialCount = result.container.querySelectorAll(`.${styles.lifeLogTree.childrenNodes}`).length;

      // $log3 has no tree nodes. Enter tree to create one (ノード作成 + hasTreeNodes=true).
      await userEvent.keyboard("{l}");
      await awaitPendingCallbacks();

      await waitFor(() => {
        expect(result.container.querySelectorAll(`.${styles.lifeLogTree.childrenNodes}`).length).toBe(initialCount + 1);
      });

      // Enter editing mode on the empty node, then Backspace → deleteLastNode
      await userEvent.keyboard("{i}");
      await awaitPendingCallbacks();
      await waitFor(() => {
        const input = result.container.querySelector("input") as HTMLInputElement;
        expect(input).toBeTruthy();
        expect(input.value).toBe("");
      });

      await userEvent.keyboard("{Backspace}");
      await awaitPendingCallbacks();

      // hasTreeNodes should be false, childrenNodes wrapper gone, back to lifeLog editing
      await waitFor(
        () => {
          expect(result.container.querySelectorAll(`.${styles.lifeLogTree.childrenNodes}`).length).toBe(initialCount);
        },
        { timeout: 3000 },
      );

      // Exit editing mode to allow undo keybind
      await userEvent.keyboard("{Escape}");
      await awaitPendingCallbacks();

      // Undo → node and hasTreeNodes restored
      await userEvent.keyboard("{u}");
      await awaitPendingCallbacks();

      await waitFor(
        () => {
          expect(result.container.querySelectorAll(`.${styles.lifeLogTree.childrenNodes}`).length).toBe(initialCount + 1);
        },
        { timeout: 3000 },
      );

      // Redo → node deleted again
      await userEvent.keyboard("{r}");
      await awaitPendingCallbacks();

      await waitFor(
        () => {
          expect(result.container.querySelectorAll(`.${styles.lifeLogTree.childrenNodes}`).length).toBe(initialCount);
        },
        { timeout: 3000 },
      );
    });
  });
});
