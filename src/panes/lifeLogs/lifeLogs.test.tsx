import { cleanup } from "@solidjs/testing-library";
import { Timestamp } from "firebase/firestore";
import { afterAll, afterEach, beforeAll, describe, expect, vi } from "vitest";
import { page, userEvent } from "vitest/browser";

import { awaitPendingCallbacks } from "@/awaitableCallback";
import { baseTime, setupLifeLogsTest } from "@/panes/lifeLogs/test";
import { styles } from "@/styles.css";
import { acquireEmulator, releaseEmulator, testWithDb as it } from "@/test";

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

    expect(duration, `Edit text took ${duration.toFixed(2)}ms`).toBeLessThan(100);
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
    // Use a date within 7-day range: Jan 5, 2026
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
    // Use a date within 7-day range: Jan 5, 2026
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

    expect(duration, `Set startAt took ${duration.toFixed(2)}ms`).toBeLessThan(100);
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

    expect(duration, `Set endAt took ${duration.toFixed(2)}ms`).toBeLessThan(100);
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
    expect(duration, `Add new lifelog took ${duration.toFixed(2)}ms`).toBeLessThan(100);

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
      // Cursor is at the end because $log4 has non-empty text
      expect(input.selectionStart).toBe(14);
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

    describe("scroll focus", () => {
      // Use desktop viewport for these tests (mobile uses column-reverse which changes scroll behavior)
      it("moves focus to topmost visible LifeLog when focused LifeLog scrolls out above", async ({ db, task }) => {
        await page.viewport(1200, 600);
        const { result } = await setupLifeLogsTest(task.id, db, { lifeLogCount: 15, lifeLogsProps: { debounceMs: 0 } });

        const wrapper = result.container.querySelector(`.${styles.lifeLogs.wrapper}`) as HTMLElement;
        const container = result.container.querySelector(`.${styles.lifeLogs.container}`) as HTMLElement;
        // Make container scrollable by setting a fixed height on wrapper (flexbox layout)
        wrapper.style.height = "400px";

        // Navigate to first item with g key
        await userEvent.keyboard("{g}");
        await awaitPendingCallbacks();

        const initialSelected = result.container.querySelector(`.${styles.lifeLogTree.selected}`);
        expect(initialSelected).toBeTruthy();
        const initialId = initialSelected?.closest("li")?.id;

        // Scroll down programmatically to make focused LifeLog go above the visible area
        container.scrollTop = 800;
        // Wait for scroll to be applied
        await new Promise((r) => setTimeout(r, 50));

        // Verify scroll actually happened
        expect(container.scrollTop, "scroll should have happened").toBeGreaterThan(100);

        // Focus should have moved to a visible LifeLog (not the initial one)
        const newSelected = result.container.querySelector(`.${styles.lifeLogTree.selected}`);
        expect(newSelected).toBeTruthy();
        const newId = newSelected?.closest("li")?.id;
        expect(newId).not.toBe(initialId);

        // The new selected element should be visible
        const containerRect = container.getBoundingClientRect();
        const newSelectedRect = newSelected!.getBoundingClientRect();
        expect(newSelectedRect.top).toBeGreaterThanOrEqual(containerRect.top);
        expect(newSelectedRect.bottom).toBeLessThanOrEqual(containerRect.bottom);
      });

      it("moves focus to bottommost visible LifeLog when focused LifeLog scrolls out below", async ({ db, task }) => {
        await page.viewport(1200, 600);
        const { result } = await setupLifeLogsTest(task.id, db, { lifeLogCount: 15, lifeLogsProps: { debounceMs: 0 } });

        const wrapper = result.container.querySelector(`.${styles.lifeLogs.wrapper}`) as HTMLElement;
        const container = result.container.querySelector(`.${styles.lifeLogs.container}`) as HTMLElement;
        // Make container scrollable by setting a fixed height on wrapper (flexbox layout)
        wrapper.style.height = "400px";

        // Navigate to last item with G key
        await userEvent.keyboard("{Shift>}{g}{/Shift}");
        await awaitPendingCallbacks();

        const initialSelected = result.container.querySelector(`.${styles.lifeLogTree.selected}`);
        expect(initialSelected).toBeTruthy();
        const initialId = initialSelected?.closest("li")?.id;

        // Scroll up programmatically to make focused LifeLog go below the visible area
        container.scrollTop = 0;
        // Wait for scroll to be applied
        await new Promise((r) => setTimeout(r, 50));

        // Focus should have moved to a visible LifeLog (not the initial one)
        const newSelected = result.container.querySelector(`.${styles.lifeLogTree.selected}`);
        expect(newSelected).toBeTruthy();
        const newId = newSelected?.closest("li")?.id;
        expect(newId).not.toBe(initialId);

        // The new selected element should be visible
        const containerRect = container.getBoundingClientRect();
        const newSelectedRect = newSelected!.getBoundingClientRect();
        expect(newSelectedRect.top).toBeGreaterThanOrEqual(containerRect.top);
        expect(newSelectedRect.bottom).toBeLessThanOrEqual(containerRect.bottom);
      });

      it("does not move focus when editing", async ({ db, task }) => {
        await page.viewport(1200, 600);
        const { result } = await setupLifeLogsTest(task.id, db, { lifeLogCount: 15, lifeLogsProps: { debounceMs: 0 } });

        const wrapper = result.container.querySelector(`.${styles.lifeLogs.wrapper}`) as HTMLElement;
        const container = result.container.querySelector(`.${styles.lifeLogs.container}`) as HTMLElement;
        // Make container scrollable by setting a fixed height on wrapper (flexbox layout)
        wrapper.style.height = "400px";

        // Navigate to first item with g key
        await userEvent.keyboard("{g}");
        await awaitPendingCallbacks();

        // Enter editing mode
        await userEvent.keyboard("{i}");
        await awaitPendingCallbacks();

        const input = result.container.querySelector("input") as HTMLInputElement;
        expect(input).toBeTruthy();

        const selectedBefore = result.container.querySelector(`.${styles.lifeLogTree.selected}`);
        const selectedIdBefore = selectedBefore?.closest("li")?.id;

        // Scroll down programmatically
        container.scrollTop = 800;
        // Wait for scroll to be applied
        await new Promise((r) => setTimeout(r, 50));

        // Focus should NOT have moved (still editing)
        const selectedAfter = result.container.querySelector(`.${styles.lifeLogTree.selected}`);
        const selectedIdAfter = selectedAfter?.closest("li")?.id;
        expect(selectedIdAfter).toBe(selectedIdBefore);

        // Input should still be present
        expect(result.container.querySelector("input")).toBeTruthy();
      });

      it("exits tree and moves focus to visible LifeLog when scrolling in tree mode", async ({ db, task }) => {
        await page.viewport(1200, 600);
        const { result } = await setupLifeLogsTest(task.id, db, {
          lifeLogCount: 15,
          treeNodeCount: 5,
          lifeLogsProps: { debounceMs: 0 },
        });

        const wrapper = result.container.querySelector(`.${styles.lifeLogs.wrapper}`) as HTMLElement;
        const container = result.container.querySelector(`.${styles.lifeLogs.container}`) as HTMLElement;
        // Make container scrollable by setting a fixed height on wrapper (flexbox layout)
        wrapper.style.height = "400px";

        // Navigate to first item with g key
        await userEvent.keyboard("{g}");
        await awaitPendingCallbacks();

        // Enter tree mode with l key
        await userEvent.keyboard("{l}");
        await awaitPendingCallbacks();

        // Verify tree mode is active (childrenNodes should be visible)
        const childrenNodes = result.container.querySelector(`.${styles.lifeLogTree.childrenNodes}`);
        expect(childrenNodes).toBeTruthy();

        const selectedBefore = result.container.querySelector(`.${styles.lifeLogTree.selected}`);
        const selectedIdBefore = selectedBefore?.closest("li")?.id;

        // Scroll down programmatically to make focused LifeLog go above the visible area
        container.scrollTop = 800;
        // Wait for scroll to be applied
        await new Promise((r) => setTimeout(r, 50));

        // Focus should have moved to a visible LifeLog
        const selectedAfter = result.container.querySelector(`.${styles.lifeLogTree.selected}`);
        const selectedIdAfter = selectedAfter?.closest("li")?.id;
        expect(selectedIdAfter).not.toBe(selectedIdBefore);

        // Tree mode should be exited (childrenNodes should no longer be visible)
        const childrenNodesAfter = result.container.querySelector(`.${styles.lifeLogTree.childrenNodes}`);
        expect(childrenNodesAfter).toBeNull();
      });
    });

    describe("mobile (column-reverse)", () => {
      it("moves focus to topmost visible LifeLog when focused LifeLog scrolls out above (mobile)", async ({
        db,
        task,
      }) => {
        await page.viewport(414, 896);
        const { result } = await setupLifeLogsTest(task.id, db, { lifeLogCount: 15, lifeLogsProps: { debounceMs: 0 } });

        const wrapper = result.container.querySelector(`.${styles.lifeLogs.wrapper}`) as HTMLElement;
        const container = result.container.querySelector(`.${styles.lifeLogs.container}`) as HTMLElement;
        // Make container scrollable by setting a fixed height on wrapper (flexbox layout)
        wrapper.style.height = "400px";

        // On mobile with column-reverse, G (last item) appears at visual top
        await userEvent.keyboard("{Shift>}{g}{/Shift}");
        await awaitPendingCallbacks();

        const initialSelected = result.container.querySelector(`.${styles.lifeLogTree.selected}`);
        expect(initialSelected).toBeTruthy();
        const initialId = initialSelected?.closest("li")?.id;

        // On mobile, scrolling down (increasing scrollTop) moves visual content up,
        // so the visually top element goes above visible area
        container.scrollTop = 800;
        await new Promise((r) => setTimeout(r, 50));

        // Focus should have moved to a visible LifeLog (not the initial one)
        const newSelected = result.container.querySelector(`.${styles.lifeLogTree.selected}`);
        expect(newSelected).toBeTruthy();
        const newId = newSelected?.closest("li")?.id;
        expect(newId).not.toBe(initialId);

        // The new selected element should be visible
        const containerRect = container.getBoundingClientRect();
        const newSelectedRect = newSelected!.getBoundingClientRect();
        expect(newSelectedRect.top).toBeGreaterThanOrEqual(containerRect.top);
        expect(newSelectedRect.bottom).toBeLessThanOrEqual(containerRect.bottom);
      });

      it("moves focus to bottommost visible LifeLog when focused LifeLog scrolls out below (mobile)", async ({
        db,
        task,
      }) => {
        await page.viewport(414, 896);
        const { result } = await setupLifeLogsTest(task.id, db, { lifeLogCount: 15, lifeLogsProps: { debounceMs: 0 } });

        const wrapper = result.container.querySelector(`.${styles.lifeLogs.wrapper}`) as HTMLElement;
        const container = result.container.querySelector(`.${styles.lifeLogs.container}`) as HTMLElement;
        // Make container scrollable by setting a fixed height on wrapper (flexbox layout)
        wrapper.style.height = "400px";

        // On mobile with column-reverse, g (first item) appears at visual bottom
        await userEvent.keyboard("{g}");
        await awaitPendingCallbacks();

        const initialSelected = result.container.querySelector(`.${styles.lifeLogTree.selected}`);
        expect(initialSelected).toBeTruthy();
        const initialId = initialSelected?.closest("li")?.id;

        // On mobile, scrolling up (scrollTop = 0) moves visual content down,
        // so the visually bottom element goes below visible area
        container.scrollTop = 0;
        await new Promise((r) => setTimeout(r, 50));

        // Focus should have moved to a visible LifeLog (not the initial one)
        const newSelected = result.container.querySelector(`.${styles.lifeLogTree.selected}`);
        expect(newSelected).toBeTruthy();
        const newId = newSelected?.closest("li")?.id;
        expect(newId).not.toBe(initialId);

        // The new selected element should be visible
        const containerRect = container.getBoundingClientRect();
        const newSelectedRect = newSelected!.getBoundingClientRect();
        expect(newSelectedRect.top).toBeGreaterThanOrEqual(containerRect.top);
        expect(newSelectedRect.bottom).toBeLessThanOrEqual(containerRect.bottom);
      });

      it("does not move focus when editing (mobile)", async ({ db, task }) => {
        await page.viewport(414, 896);
        const { result } = await setupLifeLogsTest(task.id, db, { lifeLogCount: 15, lifeLogsProps: { debounceMs: 0 } });

        const wrapper = result.container.querySelector(`.${styles.lifeLogs.wrapper}`) as HTMLElement;
        const container = result.container.querySelector(`.${styles.lifeLogs.container}`) as HTMLElement;
        // Make container scrollable by setting a fixed height on wrapper (flexbox layout)
        wrapper.style.height = "400px";

        // Navigate to first item with g key
        await userEvent.keyboard("{g}");
        await awaitPendingCallbacks();

        // Enter editing mode
        await userEvent.keyboard("{i}");
        await awaitPendingCallbacks();

        const input = result.container.querySelector("input") as HTMLInputElement;
        expect(input).toBeTruthy();

        const selectedBefore = result.container.querySelector(`.${styles.lifeLogTree.selected}`);
        const selectedIdBefore = selectedBefore?.closest("li")?.id;

        // Scroll down programmatically
        container.scrollTop = 800;
        // Wait for scroll to be applied
        await new Promise((r) => setTimeout(r, 50));

        // Focus should NOT have moved (still editing)
        const selectedAfter = result.container.querySelector(`.${styles.lifeLogTree.selected}`);
        const selectedIdAfter = selectedAfter?.closest("li")?.id;
        expect(selectedIdAfter).toBe(selectedIdBefore);

        // Input should still be present
        expect(result.container.querySelector("input")).toBeTruthy();
      });

      it("exits tree and moves focus to visible LifeLog when scrolling in tree mode (mobile)", async ({ db, task }) => {
        await page.viewport(414, 896);
        const { result } = await setupLifeLogsTest(task.id, db, {
          lifeLogCount: 15,
          treeNodeCount: 5,
          lifeLogsProps: { debounceMs: 0 },
        });

        const wrapper = result.container.querySelector(`.${styles.lifeLogs.wrapper}`) as HTMLElement;
        const container = result.container.querySelector(`.${styles.lifeLogs.container}`) as HTMLElement;
        // Make container scrollable by setting a fixed height on wrapper (flexbox layout)
        wrapper.style.height = "400px";

        // Navigate to first item with g key
        await userEvent.keyboard("{g}");
        await awaitPendingCallbacks();

        // Enter tree mode with l key
        await userEvent.keyboard("{l}");
        await awaitPendingCallbacks();

        // Verify tree mode is active (childrenNodes should be visible)
        const childrenNodes = result.container.querySelector(`.${styles.lifeLogTree.childrenNodes}`);
        expect(childrenNodes).toBeTruthy();

        const selectedBefore = result.container.querySelector(`.${styles.lifeLogTree.selected}`);
        const selectedIdBefore = selectedBefore?.closest("li")?.id;

        // Scroll down programmatically to make focused LifeLog go above the visible area
        container.scrollTop = 800;
        // Wait for scroll to be applied
        await new Promise((r) => setTimeout(r, 50));

        // Focus should have moved to a visible LifeLog
        const selectedAfter = result.container.querySelector(`.${styles.lifeLogTree.selected}`);
        const selectedIdAfter = selectedAfter?.closest("li")?.id;
        expect(selectedIdAfter).not.toBe(selectedIdBefore);

        // Tree mode should be exited (childrenNodes should no longer be visible)
        const childrenNodesAfter = result.container.querySelector(`.${styles.lifeLogTree.childrenNodes}`);
        expect(childrenNodesAfter).toBeNull();
      });

      it("does not cause unwanted scroll when moving focus to fully visible LifeLog", async ({ db, task }) => {
        await page.viewport(1200, 600);
        const { result } = await setupLifeLogsTest(task.id, db, { lifeLogCount: 15, lifeLogsProps: { debounceMs: 0 } });

        const wrapper = result.container.querySelector(`.${styles.lifeLogs.wrapper}`) as HTMLElement;
        const container = result.container.querySelector(`.${styles.lifeLogs.container}`) as HTMLElement;
        // Make container scrollable by setting a fixed height on wrapper (flexbox layout)
        wrapper.style.height = "400px";

        // Navigate to first item with g key
        await userEvent.keyboard("{g}");
        await awaitPendingCallbacks();

        // Scroll down to move the first LifeLog out of view
        container.scrollTop = 800;
        // Wait for scroll event and focus change
        await new Promise((r) => setTimeout(r, 50));

        // Record the scroll position after focus change
        const scrollAfterFocusChange = container.scrollTop;

        // Wait a bit more to catch any unwanted scroll
        await new Promise((r) => setTimeout(r, 100));
        await awaitPendingCallbacks();

        // The scroll position should not have changed (no unwanted scroll)
        expect(container.scrollTop).toBe(scrollAfterFocusChange);

        // Verify focus actually moved to a visible element
        const newSelected = result.container.querySelector(`.${styles.lifeLogTree.selected}`);
        expect(newSelected).toBeTruthy();
        const containerRect = container.getBoundingClientRect();
        const newSelectedRect = newSelected!.getBoundingClientRect();
        expect(newSelectedRect.top).toBeGreaterThanOrEqual(containerRect.top);
        expect(newSelectedRect.bottom).toBeLessThanOrEqual(containerRect.bottom);
      });
    });
  });

  describe("scroll window (time range)", () => {
    it("slides window to show out-of-range LifeLog when selected", async ({ db, task }) => {
      // Create an out-of-range LifeLog (endAt 14 days ago, outside the default 7-day range)
      const { result } = await setupLifeLogsTest(task.id, db, {
        outOfRangeLifeLogs: [{ id: "$oldLog", text: "old lifelog", daysAgo: 15, endDaysAgo: 14 }],
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

    it("does not slide window when selecting LifeLog with noneTimestamp endAt", async ({ db, task }) => {
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

    it("slides window when navigating with k key to show previously hidden LifeLogs", async ({ db, task }) => {
      // Create LifeLogs at different time points (based on endAt for the new query):
      // - $nearPast: endAt 3 days ago (within initial 7-day range)
      // - $farPast: endAt 9 days ago (outside initial 7-day range, but within range after sliding to $nearPast)
      const { result } = await setupLifeLogsTest(task.id, db, {
        outOfRangeLifeLogs: [
          { id: "$nearPast", text: "near past lifelog", daysAgo: 4, endDaysAgo: 3 },
          { id: "$farPast", text: "far past lifelog", daysAgo: 10, endDaysAgo: 9 },
        ],
        lifeLogsProps: { debounceMs: 0 },
      });

      // $nearPast should be visible (endAt within 7-day range)
      await result.findByText("near past lifelog");

      // $farPast should NOT be visible initially (endAt 9 days ago, outside 7-day range)
      expect(result.queryByText("far past lifelog")).toBeNull();

      // Navigate with k key to $nearPast (going backwards in time from $log1)
      // Order by endAt: $farPast (endAt 9d ago) -> $nearPast (endAt 3d ago) -> $log1 (endAt none) -> $log2 -> $log3
      await userEvent.keyboard("{k}");
      await awaitPendingCallbacks();

      // Wait for debounced update to slide the window
      await new Promise((r) => setTimeout(r, 50));
      await awaitPendingCallbacks();

      // After sliding to $nearPast, the window should now include $farPast
      // $nearPast's endAt is 3 days ago, so new range is (3-7)=10 days ago to (3+7)=4 days in future
      // $farPast (endAt 9 days ago) is now within this range
      const farPastElement = await result.findByText("far past lifelog");
      expect(farPastElement).toBeTruthy();
    });

    it("slides window when navigating with j key to show previously hidden LifeLogs", async ({ db, task }) => {
      // Create LifeLogs at different time points (based on endAt for the new query):
      // - $farPast: endAt 9 days ago (outside initial 7-day range, visible after sliding to $nearPast)
      // - $nearPast: endAt 3 days ago (within initial 7-day range, will be selected first)
      // Start from $nearPast and navigate forward with j key
      const { result } = await setupLifeLogsTest(task.id, db, {
        outOfRangeLifeLogs: [
          { id: "$farPast", text: "far past lifelog", daysAgo: 10, endDaysAgo: 9 },
          { id: "$nearPast", text: "near past lifelog", daysAgo: 4, endDaysAgo: 3 },
        ],
        lifeLogsProps: { debounceMs: 0 },
        initialSelectedId: "$nearPast", // Start from $nearPast (endAt 3 days ago)
      });

      // Wait for initial window slide to $nearPast
      await new Promise((r) => setTimeout(r, 50));
      await awaitPendingCallbacks();

      // After sliding to $nearPast, $farPast should now be visible
      await result.findByText("far past lifelog");
      await result.findByText("near past lifelog");

      // Now navigate forward with j key to $log1
      // Order by endAt: $farPast (endAt 9d ago) -> $nearPast (endAt 3d ago) -> $log1 (endAt none) -> $log2 -> $log3
      await userEvent.keyboard("{j}");
      await awaitPendingCallbacks();

      // Wait for debounced update to slide the window
      await new Promise((r) => setTimeout(r, 50));
      await awaitPendingCallbacks();

      // After sliding to $log1, $farPast should be outside the range (endAt 9 days ago from day 0)
      // New range is day -7 to day +7, so $farPast (endAt day -9) is outside
      expect(result.queryByText("far past lifelog")).toBeNull();

      // $log1 should be visible and selected
      expect(result.getByText("first lifelog")).toBeTruthy();
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

        // Initially, ▶️/◀️ buttons should not exist in navigation mode
        const nextFieldButtonInitial = Array.from(
          result.container.querySelectorAll(`.${styles.mobileToolbar.button}`),
        ).filter((btn) => btn.textContent === "▶️");
        // In navigation mode, no ▶️ button exists (📝▶️ exists for startAt editing)
        expect(nextFieldButtonInitial.length).toBe(0);

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
    });
  });
});
