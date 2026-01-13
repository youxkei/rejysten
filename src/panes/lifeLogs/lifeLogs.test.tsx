import { waitFor } from "@solidjs/testing-library";
import { describe, expect, vi } from "vitest";
import { userEvent } from "vitest/browser";

import { baseTime, setupLifeLogsTest } from "@/panes/lifeLogs/testUtils";
import { styles } from "@/styles.css";
import { testWithDb as it } from "@/test";

vi.mock(import("@/date"), async (importOriginal) => {
  const mod = await importOriginal();

  return {
    ...mod,
    NewDate: () => baseTime,
    DateNow: () => baseTime.getTime(),
  };
});

describe("<LifeLogs />", { timeout: 5000 }, () => {
  describe("LifeLog", () => {
    it("renders correctly", async ({ db, task }) => {
      const { result } = await setupLifeLogsTest(task.id, db);

      // Test: renders lifelog data correctly
      const firstElement = await result.findByText("first lifelog");
      expect(firstElement).toBeTruthy();

      // Test: renders multiple lifelogs
      const secondElement = await result.findByText("second lifelog");
      expect(secondElement).toBeTruthy();

      // Test: lifelogs are rendered in correct order (by startAt)
      const listItems = result.container.querySelectorAll("li");
      const firstIndex = Array.from(listItems).findIndex((li) => li.textContent?.includes("first lifelog"));
      const secondIndex = Array.from(listItems).findIndex((li) => li.textContent?.includes("second lifelog"));
      expect(firstIndex).toBeLessThan(secondIndex);

      // Test: endAt is noneTimestamp, so it should show "N/A"
      const naElements = result.getAllByText("N/A");
      expect(naElements.length).toBe(4); // $log1 and $log2 have noneTimestamp endAt, $log3 has both startAt and endAt as noneTimestamp

      // Test: time is displayed correctly (format: YYYY-MM-DD HH:MM:SS)
      expect(result.getByText("2026-01-10 10:30:00")).toBeTruthy();
      expect(result.getByText("2026-01-10 12:00:00")).toBeTruthy();

      result.unmount();
    });

    it("can edit text with i key (cursor at start)", async ({ db, task }) => {
      const { result } = await setupLifeLogsTest(task.id, db);

      await result.findByText("first lifelog");

      // $log1 is already selected in setup, press "i" to enter editing mode with cursor at start
      await userEvent.keyboard("{i}");

      // Wait for input to appear and type new text
      await waitFor(() => {
        const input = result.container.querySelector("input");
        expect(input).toBeTruthy();
      });

      const input = result.container.querySelector("input")!;
      input.focus();
      // Type at the beginning (cursor is at start with 'i' key)
      await userEvent.keyboard("prefix ");

      // Press Escape to save and exit editing
      await userEvent.keyboard("{Escape}");

      // Verify the DOM was updated - "prefix " was added at the beginning
      await waitFor(() => {
        expect(result.getByText("prefix first lifelog")).toBeTruthy();
      });
      expect(result.queryByText("first lifelog")).toBeNull();

      result.unmount();
    });

    it("can edit text with a key (cursor at end)", async ({ db, task }) => {
      const { result } = await setupLifeLogsTest(task.id, db);

      await result.findByText("first lifelog");

      // $log1 is already selected in setup, press "a" to enter editing mode with cursor at end
      await userEvent.keyboard("{a}");

      // Wait for input to appear and type new text
      await waitFor(() => {
        const input = result.container.querySelector("input");
        expect(input).toBeTruthy();
      });

      const input = result.container.querySelector("input")!;
      input.focus();
      // Delete one character using backspace, then type additional text (cursor is at end with 'a' key)
      await userEvent.keyboard("{Backspace} edited");

      // Press Escape to save and exit editing
      const start = performance.now();
      await userEvent.keyboard("{Escape}");

      // Verify the DOM was updated - original was "first lifelog", deleted 'g', added " edited"
      await waitFor(() => {
        expect(result.getByText("first lifelo edited")).toBeTruthy();
      });
      const end = performance.now();
      const duration = end - start;

      expect(duration, `Edit text took ${duration.toFixed(2)}ms`).toBeLessThan(100);
      expect(result.queryByText("first lifelog")).toBeNull();

      result.unmount();
    });

    it("can navigate to startAt and endAt fields with Tab key during editing", async ({ db, task }) => {
      const { result } = await setupLifeLogsTest(task.id, db);

      await result.findByText("first lifelog");

      // Verify initial startAt is displayed as "10:30:00"
      expect(result.getByText("2026-01-10 10:30:00")).toBeTruthy();

      // $log1 is already selected in setup, press "i" to enter editing mode (starts in text field)
      await userEvent.keyboard("{i}");

      // Wait for input to appear with text field value
      await waitFor(() => {
        const input = result.container.querySelector("input");
        expect(input).toBeTruthy();
        expect((input as HTMLInputElement).value).toBe("first lifelog");
      });

      // Press Tab to navigate to startAt field
      await userEvent.keyboard("{Tab}");

      // Wait for input to show startAt value (format without separators: YYYYMMDD HHMMSS)
      await waitFor(() => {
        const input = result.container.querySelector("input") as HTMLInputElement;
        expect(input).toBeTruthy();
        expect(input.value).toBe("20260110 103000");
      });

      // Edit startAt: delete last character and type "5" to change 103000 -> 103005
      await userEvent.keyboard("{Backspace}5");

      await waitFor(() => {
        const input = result.container.querySelector("input") as HTMLInputElement;
        expect(input.value).toBe("20260110 103005");
      });

      // Press Tab to navigate to endAt field (this saves startAt)
      await userEvent.keyboard("{Tab}");

      // Wait for input to show endAt value (empty string since it's noneTimestamp)
      await waitFor(() => {
        const input = result.container.querySelector("input") as HTMLInputElement;
        expect(input).toBeTruthy();
        expect(input.value).toBe(""); // noneTimestamp shows as empty in edit mode
      });

      // Edit endAt: type a new time value in format without separators (YYYYMMDD HHMMSS)
      await userEvent.keyboard("20260110 110000");

      await waitFor(() => {
        const input = result.container.querySelector("input") as HTMLInputElement;
        expect(input.value).toBe("20260110 110000");
      });

      // Press Escape to save and exit editing
      await userEvent.keyboard("{Escape}");

      // Verify the DOM was updated with new startAt
      await waitFor(() => {
        expect(result.getByText("2026-01-10 10:30:05")).toBeTruthy();
      });

      // Verify startAt was changed (old value should not exist)
      expect(result.queryByText("2026-01-10 10:30:00")).toBeNull();

      // Verify endAt was set (should now show the new time instead of N/A)
      await waitFor(() => {
        expect(result.getByText("2026-01-10 11:00:00")).toBeTruthy();
      });

      // Verify N/A count decreased (was 4, now 3: $log2 endAt, $log3 startAt, $log3 endAt)
      const naElements = result.getAllByText("N/A");
      expect(naElements.length).toBe(3);

      result.unmount();
    });

    it("can edit startAt with various digit formats", async ({ db, task }) => {
      const { result } = await setupLifeLogsTest(task.id, db);

      await result.findByText("first lifelog");

      // Helper to enter edit mode for startAt
      async function enterStartAtEditMode() {
        await userEvent.keyboard("{i}"); // Enter text edit mode
        await waitFor(() => {
          const input = result.container.querySelector("input");
          expect(input).toBeTruthy();
        });
        await userEvent.keyboard("{Tab}"); // Navigate to startAt
        // Wait for the input to be the startAt input (check it has a time-like value)
        await waitFor(() => {
          const input = result.container.querySelector("input") as HTMLInputElement;
          expect(input).toBeTruthy();
          // startAt value should be in format "YYYYMMDD HHMMSS" (without separators)
          expect(input.value).toMatch(/^\d{8} \d{6}$/);
        });
      }

      // Test 4-digit format (HHMM) - should use current date (2026-01-10) with specified time, seconds = 0
      await enterStartAtEditMode();
      await userEvent.keyboard("{Control>}a{/Control}1234");
      await userEvent.keyboard("{Escape}");

      await waitFor(() => {
        expect(result.getByText("2026-01-10 12:34:00")).toBeTruthy();
      });

      // Test 6-digit format (HHMMSS) - should use current date with specified time
      await enterStartAtEditMode();
      await userEvent.keyboard("{Control>}a{/Control}123456");
      await userEvent.keyboard("{Escape}");

      await waitFor(() => {
        expect(result.getByText("2026-01-10 12:34:56")).toBeTruthy();
      });

      // Test 9-digit format (DD HHMMSS) - should use current year/month (2026-01) with specified day and time
      await enterStartAtEditMode();
      await userEvent.keyboard("{Control>}a{/Control}08 091500");
      await userEvent.keyboard("{Escape}");

      await waitFor(() => {
        expect(result.getByText("2026-01-08 09:15:00")).toBeTruthy();
      });

      // Test 15-digit format (YYYYMMDD HHMMSS) - full date and time
      // Use a date within 7-day range: Jan 5, 2026
      await enterStartAtEditMode();
      await userEvent.keyboard("{Control>}a{/Control}20260105 180000");
      await userEvent.keyboard("{Escape}");

      await waitFor(() => {
        expect(result.getByText("2026-01-05 18:00:00")).toBeTruthy();
      });

      result.unmount();
    });

    it("can edit endAt with various digit formats", async ({ db, task }) => {
      const { result } = await setupLifeLogsTest(task.id, db);

      await result.findByText("first lifelog");

      // Helper to enter edit mode for endAt (Tab twice from text: once for startAt, once for endAt)
      // Track the startAt value to detect when we've moved to endAt
      let startAtValue = "";
      async function enterEndAtEditMode() {
        await userEvent.keyboard("{i}"); // Enter text edit mode
        await waitFor(() => {
          const input = result.container.querySelector("input");
          expect(input).toBeTruthy();
        });
        await userEvent.keyboard("{Tab}"); // Navigate to startAt
        // Wait for the input to be the startAt input
        await waitFor(() => {
          const input = result.container.querySelector("input") as HTMLInputElement;
          expect(input).toBeTruthy();
          expect(input.value).toMatch(/^\d{8} \d{6}$/);
          startAtValue = input.value;
        });
        await userEvent.keyboard("{Tab}"); // Navigate to endAt
        // Wait for the input to change from startAt value (endAt is either empty or different)
        await waitFor(() => {
          const input = result.container.querySelector("input") as HTMLInputElement;
          expect(input).toBeTruthy();
          expect(input.value).not.toBe(startAtValue);
        });
      }

      // Test 4-digit format (HHMM) - should use current date (2026-01-10) with specified time, seconds = 0
      await enterEndAtEditMode();
      await userEvent.keyboard("{Control>}a{/Control}1234");
      await userEvent.keyboard("{Escape}");

      await waitFor(() => {
        expect(result.getByText("2026-01-10 12:34:00")).toBeTruthy();
      });

      // Test 6-digit format (HHMMSS) - should use current date with specified time
      await enterEndAtEditMode();
      await userEvent.keyboard("{Control>}a{/Control}123456");
      await userEvent.keyboard("{Escape}");

      await waitFor(() => {
        expect(result.getByText("2026-01-10 12:34:56")).toBeTruthy();
      });

      // Test 9-digit format (DD HHMMSS) - should use current year/month (2026-01) with specified day and time
      await enterEndAtEditMode();
      await userEvent.keyboard("{Control>}a{/Control}08 091500");
      await userEvent.keyboard("{Escape}");

      await waitFor(() => {
        expect(result.getByText("2026-01-08 09:15:00")).toBeTruthy();
      });

      // Test 15-digit format (YYYYMMDD HHMMSS) - full date and time
      // Use a date within 7-day range: Jan 5, 2026
      await enterEndAtEditMode();
      await userEvent.keyboard("{Control>}a{/Control}20260105 180000");
      await userEvent.keyboard("{Escape}");

      await waitFor(() => {
        expect(result.getByText("2026-01-05 18:00:00")).toBeTruthy();
      });

      result.unmount();
    });

    it("can set startAt to current time with s key", async ({ db, task }) => {
      const { result } = await setupLifeLogsTest(task.id, db);

      await result.findByText("first lifelog");
      await result.findByText("third lifelog");

      // Navigate to $log3 which has noneTimestamp startAt
      // $log1 is selected, press "j" twice to get to $log3
      await userEvent.keyboard("{j}");
      await userEvent.keyboard("{j}");

      // Verify $log3 has N/A for startAt (initial state has 4 N/A: $log1 endAt, $log2 endAt, $log3 startAt, $log3 endAt)
      expect(result.getAllByText("N/A").length).toBe(4);

      // Press "S" to set current time on startAt
      const start = performance.now();
      await userEvent.keyboard("{s}");

      // Verify DOM was updated - N/A count should decrease by 1 (now only 3: $log1 endAt, $log2 endAt, $log3 endAt)
      await waitFor(() => {
        const naElements = result.getAllByText("N/A");
        expect(naElements.length).toBe(3);
      });

      // Verify the time is displayed in the DOM (should show current date-time format)
      await waitFor(() => {
        // The startAt should now show a time instead of N/A
        const timeRangeDiv = result.container.querySelector(`#\\$log3 .${styles.lifeLogTree.timeRange}`);
        expect(timeRangeDiv?.textContent).toMatch(/\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}/);
      });
      const end = performance.now();
      const duration = end - start;

      expect(duration, `Set startAt took ${duration.toFixed(2)}ms`).toBeLessThan(100);

      result.unmount();
    });

    it("can set endAt to current time with f key", async ({ db, task }) => {
      const { result } = await setupLifeLogsTest(task.id, db);

      await result.findByText("first lifelog");

      // $log1 is already selected and has endAt = noneTimestamp, so "F" key should work
      // Press "F" to set current time on endAt
      const start = performance.now();
      await userEvent.keyboard("{f}");

      // Verify DOM was updated - N/A count should decrease by 1
      // Initial: 4 N/A ($log1 endAt, $log2 endAt, $log3 startAt, $log3 endAt)
      // After: 3 N/A ($log2 endAt, $log3 startAt, $log3 endAt)
      await waitFor(() => {
        const naElements = result.getAllByText("N/A");
        expect(naElements.length).toBe(3);
      });

      // Verify DOM was updated - $log1's time range should now have two time values
      await waitFor(() => {
        const log1TimeRange = result.container.querySelector(`#\\$log1 .${styles.lifeLogTree.timeRange}`);
        const textContent = log1TimeRange?.textContent ?? "";
        // Count occurrences of date-time pattern
        const timeMatches = textContent.match(/\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}/g);
        expect(timeMatches?.length).toBe(2); // Both startAt and endAt should show times
      });
      const end = performance.now();
      const duration = end - start;

      expect(duration, `Set endAt took ${duration.toFixed(2)}ms`).toBeLessThan(100);

      result.unmount();
    });

    it("can navigate between lifelogs with j/k keys", async ({ db, task }) => {
      const { result } = await setupLifeLogsTest(task.id, db);

      await result.findByText("first lifelog");
      await result.findByText("second lifelog");

      // Initial state: $log1 is selected
      await waitFor(() => {
        const log1Element = result.getByText("first lifelog").closest(`.${styles.lifeLogTree.container}`);
        expect(log1Element?.className).toContain(styles.lifeLogTree.selected);
      });

      // Press "j" to move to $log2
      await userEvent.keyboard("{j}");

      await waitFor(() => {
        const log2Element = result.getByText("second lifelog").closest(`.${styles.lifeLogTree.container}`);
        expect(log2Element?.className).toContain(styles.lifeLogTree.selected);
      });

      // Press "j" again to move to $log3
      await userEvent.keyboard("{j}");

      await waitFor(() => {
        const log3Element = result.getByText("third lifelog").closest(`.${styles.lifeLogTree.container}`);
        expect(log3Element?.className).toContain(styles.lifeLogTree.selected);
      });

      // Press "k" to move back to $log2
      await userEvent.keyboard("{k}");

      await waitFor(() => {
        const log2Element = result.getByText("second lifelog").closest(`.${styles.lifeLogTree.container}`);
        expect(log2Element?.className).toContain(styles.lifeLogTree.selected);
      });

      // Press "k" to move back to $log1
      await userEvent.keyboard("{k}");

      await waitFor(() => {
        const log1Element = result.getByText("first lifelog").closest(`.${styles.lifeLogTree.container}`);
        expect(log1Element?.className).toContain(styles.lifeLogTree.selected);
      });

      // Press "k" at the first item should not change selection
      await userEvent.keyboard("{k}");

      await waitFor(() => {
        const log1Element = result.getByText("first lifelog").closest(`.${styles.lifeLogTree.container}`);
        expect(log1Element?.className).toContain(styles.lifeLogTree.selected);
      });

      result.unmount();
    });

    it("can add new lifelog with o key", async ({ db, task }) => {
      const { result } = await setupLifeLogsTest(task.id, db);

      await result.findByText("first lifelog");

      // Initial count of lifelogs
      const initialListItems = result.container.querySelectorAll(`.${styles.lifeLogs.listItem}`);
      expect(initialListItems.length).toBe(3);

      // Press "o" to add a new lifelog
      const start = performance.now();
      await userEvent.keyboard("{o}");

      // Wait for new lifelog to be added and editing mode to be active
      await waitFor(() => {
        const listItems = result.container.querySelectorAll(`.${styles.lifeLogs.listItem}`);
        expect(listItems.length).toBe(4);
      });

      // Verify that editing mode is active (input should be visible)
      await waitFor(() => {
        const input = result.container.querySelector("input");
        expect(input).toBeTruthy();
      });
      const end = performance.now();
      const duration = end - start;

      // Assert operation completes within 100ms
      expect(duration, `Add new lifelog took ${duration.toFixed(2)}ms`).toBeLessThan(100);

      // Type text for the new lifelog
      const input = result.container.querySelector("input")!;
      input.focus();
      await userEvent.keyboard("new lifelog from o key");

      // Press Escape to save and exit editing
      await userEvent.keyboard("{Escape}");

      // Verify the new lifelog text is displayed
      await waitFor(() => {
        expect(result.getByText("new lifelog from o key")).toBeTruthy();
      });

      result.unmount();
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
      await userEvent.keyboard("{j}");
      await waitFor(() => {
        const listItems = result.container.querySelectorAll("li");
        const item = listItems[2];
        expect(item.querySelector(`.${styles.lifeLogTree.selected}`)).toBeTruthy();
      });

      // $log3 has startAt=none, endAt=none, text="third lifelog"
      // Press "i" to enter editing mode at beginning (cursor at position 0)
      await userEvent.keyboard("{i}");
      await waitFor(() => {
        const input = result.container.querySelector("input");
        expect(input).toBeTruthy();
        expect((input as HTMLInputElement).value).toBe("third lifelog");
      });

      // Clear the text to make it deletable
      await userEvent.keyboard("{Control>}a{/Control}{Backspace}");
      await waitFor(() => {
        const input = result.container.querySelector("input") as HTMLInputElement;
        expect(input.value).toBe("");
      });

      // Save the change by exiting edit mode (triggers onBlur save)
      await userEvent.keyboard("{Escape}");
      await waitFor(() => {
        expect(result.container.querySelector("input")).toBeNull();
      });

      // Re-enter edit mode
      await userEvent.keyboard("{i}");
      await waitFor(() => {
        const input = result.container.querySelector("input");
        expect(input).toBeTruthy();
        expect((input as HTMLInputElement).value).toBe("");
      });

      // Press Backspace at position 0 on empty text - should delete and move to $log2
      await userEvent.keyboard("{Backspace}");

      // Wait for deletion and cursor move to $log2 (previous log)
      await waitFor(() => {
        const listItems = result.container.querySelectorAll("li");
        expect(listItems.length).toBe(2);
      });

      await waitFor(() => {
        const input = result.container.querySelector("input") as HTMLInputElement;
        expect(input).toBeTruthy();
        expect(input.value).toBe("second lifelog");
        // Cursor should be at the end (14 characters)
        expect(input.selectionStart).toBe(14);
      });

      // Exit editing mode
      await userEvent.keyboard("{Escape}");
      await waitFor(() => {
        expect(result.container.querySelector("input")).toBeNull();
      });

      result.unmount();
    });

    it("can delete empty LifeLog with Delete and move cursor to next LifeLog", async ({ db, task }) => {
      const { result } = await setupLifeLogsTest(task.id, db);

      // Wait for initial render
      await result.findByText("first lifelog");
      await result.findByText("third lifelog");

      // Navigate to $log3 (last log) - press j twice
      await userEvent.keyboard("{j}");
      await userEvent.keyboard("{j}");
      await waitFor(() => {
        const listItems = result.container.querySelectorAll("li");
        const item = listItems[2];
        expect(item.querySelector(`.${styles.lifeLogTree.selected}`)).toBeTruthy();
      });

      // Press "o" to create a new empty LifeLog after $log3
      // This new log will have startAt=none (from $log3's endAt)
      // Since both have startAt=none, they sort by document ID (uuidv7 is time-ordered)
      await userEvent.keyboard("{o}");
      await waitFor(() => {
        const listItems = result.container.querySelectorAll("li");
        expect(listItems.length).toBe(4);
      });
      await userEvent.keyboard("{Escape}");
      await waitFor(() => {
        expect(result.container.querySelector("input")).toBeNull();
      });

      // Navigate back to $log3 (press k once)
      await userEvent.keyboard("{k}");
      await waitFor(() => {
        const listItems = result.container.querySelectorAll("li");
        // Should be on $log3 now
        const item = listItems[2];
        expect(item.querySelector(`.${styles.lifeLogTree.selected}`)).toBeTruthy();
        expect(item.textContent).toContain("third lifelog");
      });

      // Press "i" to enter editing mode
      await userEvent.keyboard("{i}");
      await waitFor(() => {
        const input = result.container.querySelector("input");
        expect(input).toBeTruthy();
        expect((input as HTMLInputElement).value).toBe("third lifelog");
      });

      // Clear the text to make it deletable
      await userEvent.keyboard("{Control>}a{/Control}{Delete}");
      await waitFor(() => {
        const input = result.container.querySelector("input") as HTMLInputElement;
        expect(input.value).toBe("");
      });

      // Save the change by exiting edit mode (triggers onBlur save)
      await userEvent.keyboard("{Escape}");
      await waitFor(() => {
        expect(result.container.querySelector("input")).toBeNull();
      });

      // Re-enter edit mode
      await userEvent.keyboard("{i}");
      await waitFor(() => {
        const input = result.container.querySelector("input");
        expect(input).toBeTruthy();
        expect((input as HTMLInputElement).value).toBe("");
      });

      // Since text is empty, position 0 = end, so Delete should work
      // Press Delete at end of text - should delete and move to next empty LifeLog
      await userEvent.keyboard("{Delete}");

      // Wait for deletion to complete - should now have 3 items
      await waitFor(() => {
        const listItems = result.container.querySelectorAll("li");
        expect(listItems.length).toBe(3);
      });

      // Verify we're in editing mode on the next LifeLog (the one we created with 'o')
      await waitFor(() => {
        const input = result.container.querySelector("input") as HTMLInputElement;
        expect(input).toBeTruthy();
        expect(input.value).toBe("");
        // Cursor should be at the start (position 0)
        expect(input.selectionStart).toBe(0);
      });

      // Exit editing mode
      await userEvent.keyboard("{Escape}");
      await waitFor(() => {
        expect(result.container.querySelector("input")).toBeNull();
      });

      result.unmount();
    });

    it("does not delete LifeLog with Backspace when text is not empty", async ({ db, task }) => {
      const { result } = await setupLifeLogsTest(task.id, db);

      // Wait for initial render
      await result.findByText("first lifelog");
      await result.findByText("second lifelog");

      // Navigate to $log2 (press j once) - it has text "second lifelog"
      await userEvent.keyboard("{j}");
      await waitFor(() => {
        const listItems = result.container.querySelectorAll("li");
        const item = listItems[1];
        expect(item.querySelector(`.${styles.lifeLogTree.selected}`)).toBeTruthy();
      });

      // Press "i" to enter editing mode at beginning
      await userEvent.keyboard("{i}");

      await waitFor(() => {
        const input = result.container.querySelector("input");
        expect(input).toBeTruthy();
        expect((input as HTMLInputElement).value).toBe("second lifelog");
      });

      // Press Backspace - should NOT delete because text is not empty
      await userEvent.keyboard("{Backspace}");

      // Should still be on same lifelog
      await waitFor(() => {
        const input = result.container.querySelector("input") as HTMLInputElement;
        expect(input).toBeTruthy();
        expect(input.value).toBe("second lifelog");
      });

      // Exit editing mode
      await userEvent.keyboard("{Escape}");
      await waitFor(() => {
        expect(result.container.querySelector("input")).toBeNull();
      });

      // All lifelogs should still exist
      const listItems = result.container.querySelectorAll("li");
      expect(listItems.length).toBe(3);

      result.unmount();
    });

    it("does not delete LifeLog with Backspace when startAt is set", async ({ db, task }) => {
      const { result } = await setupLifeLogsTest(task.id, db);

      // Wait for initial render - $log1 is selected, has startAt set
      await result.findByText("first lifelog");

      // Press "i" to enter editing mode
      await userEvent.keyboard("{i}");

      await waitFor(() => {
        const input = result.container.querySelector("input");
        expect(input).toBeTruthy();
        expect((input as HTMLInputElement).value).toBe("first lifelog");
      });

      // Clear the text to test startAt condition (not the text condition)
      // Select all and delete
      await userEvent.keyboard("{Control>}a{/Control}{Backspace}");

      await waitFor(() => {
        const input = result.container.querySelector("input") as HTMLInputElement;
        expect(input.value).toBe("");
      });

      // Save the change by exiting edit mode
      await userEvent.keyboard("{Escape}");
      await waitFor(() => {
        expect(result.container.querySelector("input")).toBeNull();
      });

      // Re-enter edit mode
      await userEvent.keyboard("{i}");
      await waitFor(() => {
        const input = result.container.querySelector("input");
        expect(input).toBeTruthy();
        expect((input as HTMLInputElement).value).toBe("");
      });

      // Now press Backspace - should NOT delete because startAt is set
      await userEvent.keyboard("{Backspace}");

      // Wait a bit to ensure nothing happens
      await new Promise((r) => setTimeout(r, 100));

      // Should still be on same lifelog
      const input = result.container.querySelector("input") as HTMLInputElement;
      expect(input).toBeTruthy();
      expect(input.value).toBe("");

      // Exit editing mode
      await userEvent.keyboard("{Escape}");
      await waitFor(() => {
        expect(result.container.querySelector("input")).toBeNull();
      });

      // All lifelogs should still exist
      const listItems = result.container.querySelectorAll("li");
      expect(listItems.length).toBe(3);

      result.unmount();
    });

    it("does not delete LifeLog with Backspace when endAt is set", async ({ db, task }) => {
      const { result } = await setupLifeLogsTest(task.id, db);

      // Wait for initial render
      await result.findByText("first lifelog");

      // Navigate to $log2
      await userEvent.keyboard("{j}");
      await waitFor(() => {
        const listItems = result.container.querySelectorAll("li");
        const item = listItems[1];
        expect(item.querySelector(`.${styles.lifeLogTree.selected}`)).toBeTruthy();
      });

      // Set $log2's endAt first to give distinct startAt to new log
      await userEvent.keyboard("{f}");
      await waitFor(() => {
        const listItems = result.container.querySelectorAll("li");
        const item = listItems[1];
        expect(item.textContent).not.toContain("N/A");
      });

      // Press "o" to add a new empty LifeLog
      await userEvent.keyboard("{o}");
      await waitFor(() => {
        const listItems = result.container.querySelectorAll("li");
        expect(listItems.length).toBe(4);
      });
      await userEvent.keyboard("{Escape}");
      await waitFor(() => {
        expect(result.container.querySelector("input")).toBeNull();
      });

      // Press "f" to set endAt on the new LifeLog
      await userEvent.keyboard("{f}");

      // Wait for endAt to be set
      await waitFor(() => {
        const listItems = result.container.querySelectorAll("li");
        const newLog = listItems[2];
        // Should now have no N/A (both startAt and endAt are set)
        expect(newLog.textContent).not.toContain("N/A");
      });

      // Press "i" to enter editing mode
      await userEvent.keyboard("{i}");

      await waitFor(() => {
        const input = result.container.querySelector("input");
        expect(input).toBeTruthy();
        expect((input as HTMLInputElement).value).toBe("");
      });

      // Press Backspace - should NOT delete because endAt is set
      await userEvent.keyboard("{Backspace}");

      // Wait a bit to ensure nothing happens
      await new Promise((r) => setTimeout(r, 100));

      // Should still be on same lifelog
      const input = result.container.querySelector("input") as HTMLInputElement;
      expect(input).toBeTruthy();
      expect(input.value).toBe("");

      // Exit editing mode
      await userEvent.keyboard("{Escape}");
      await waitFor(() => {
        expect(result.container.querySelector("input")).toBeNull();
      });

      // All lifelogs should still exist
      const listItems = result.container.querySelectorAll("li");
      expect(listItems.length).toBe(4);

      result.unmount();
    });

    it("does not delete LifeLog with Backspace when it has child nodes", async ({ db, task }) => {
      const { result } = await setupLifeLogsTest(task.id, db);

      // Wait for initial render - $log1 has child tree nodes
      await result.findByText("first lifelog");

      // Press "i" to enter editing mode on $log1
      await userEvent.keyboard("{i}");

      await waitFor(() => {
        const input = result.container.querySelector("input");
        expect(input).toBeTruthy();
        expect((input as HTMLInputElement).value).toBe("first lifelog");
      });

      // Clear the text to test child nodes condition
      await userEvent.keyboard("{Control>}a{/Control}{Backspace}");

      await waitFor(() => {
        const input = result.container.querySelector("input") as HTMLInputElement;
        expect(input.value).toBe("");
      });

      // Save the change by exiting edit mode
      await userEvent.keyboard("{Escape}");
      await waitFor(() => {
        expect(result.container.querySelector("input")).toBeNull();
      });

      // Re-enter edit mode
      await userEvent.keyboard("{i}");
      await waitFor(() => {
        const input = result.container.querySelector("input");
        expect(input).toBeTruthy();
        expect((input as HTMLInputElement).value).toBe("");
      });

      // Now press Backspace - should NOT delete because it has child nodes
      // (also startAt is set, but testing child nodes is the primary intent)
      await userEvent.keyboard("{Backspace}");

      // Wait a bit to ensure nothing happens
      await new Promise((r) => setTimeout(r, 100));

      // Should still be on same lifelog
      const input = result.container.querySelector("input") as HTMLInputElement;
      expect(input).toBeTruthy();
      expect(input.value).toBe("");

      // Exit editing mode
      await userEvent.keyboard("{Escape}");
      await waitFor(() => {
        expect(result.container.querySelector("input")).toBeNull();
      });

      // All lifelogs should still exist
      const listItems = result.container.querySelectorAll("li");
      expect(listItems.length).toBe(3);

      result.unmount();
    });

    it("does not delete first LifeLog with Backspace (no previous)", async ({ db, task }) => {
      const { result } = await setupLifeLogsTest(task.id, db);

      // Wait for initial render - $log1 is selected (first LifeLog)
      // $log1 has startAt set (10:30) and has children, which also block deletion
      // but this test primarily verifies that being the first log (no previous) blocks deletion
      await result.findByText("first lifelog");

      // Press "i" to enter editing mode on $log1
      await userEvent.keyboard("{i}");

      await waitFor(() => {
        const input = result.container.querySelector("input");
        expect(input).toBeTruthy();
        expect((input as HTMLInputElement).value).toBe("first lifelog");
      });

      // Clear the text
      await userEvent.keyboard("{Control>}a{/Control}{Backspace}");

      await waitFor(() => {
        const input = result.container.querySelector("input") as HTMLInputElement;
        expect(input.value).toBe("");
      });

      // Save the change by exiting edit mode
      await userEvent.keyboard("{Escape}");
      await waitFor(() => {
        expect(result.container.querySelector("input")).toBeNull();
      });

      // Re-enter edit mode
      await userEvent.keyboard("{i}");
      await waitFor(() => {
        const input = result.container.querySelector("input");
        expect(input).toBeTruthy();
        expect((input as HTMLInputElement).value).toBe("");
      });

      // Press Backspace - should NOT delete (no previous, also startAt is set and has children)
      await userEvent.keyboard("{Backspace}");

      // Wait a bit to ensure nothing happens
      await new Promise((r) => setTimeout(r, 100));

      // Should still be on same lifelog
      const input = result.container.querySelector("input");
      expect(input).toBeTruthy();

      // Exit editing mode
      await userEvent.keyboard("{Escape}");
      await waitFor(() => {
        expect(result.container.querySelector("input")).toBeNull();
      });

      // All lifelogs should still exist
      const listItems = result.container.querySelectorAll("li");
      expect(listItems.length).toBe(3);

      result.unmount();
    });

    it("does not delete last LifeLog with Delete (no next)", async ({ db, task }) => {
      const { result } = await setupLifeLogsTest(task.id, db);

      // Wait for initial render
      await result.findByText("first lifelog");
      await result.findByText("third lifelog");

      // Navigate to $log3 (last LifeLog) - press j twice
      await userEvent.keyboard("{j}");
      await userEvent.keyboard("{j}");
      await waitFor(() => {
        const listItems = result.container.querySelectorAll("li");
        const lastItem = listItems[2];
        expect(lastItem.querySelector(`.${styles.lifeLogTree.selected}`)).toBeTruthy();
      });

      // Press "i" to enter editing mode
      await userEvent.keyboard("{i}");

      await waitFor(() => {
        const input = result.container.querySelector("input");
        expect(input).toBeTruthy();
        expect((input as HTMLInputElement).value).toBe("third lifelog");
      });

      // Clear the text
      await userEvent.keyboard("{Control>}a{/Control}{Delete}");

      await waitFor(() => {
        const input = result.container.querySelector("input") as HTMLInputElement;
        expect(input.value).toBe("");
      });

      // Save the change by exiting edit mode
      await userEvent.keyboard("{Escape}");
      await waitFor(() => {
        expect(result.container.querySelector("input")).toBeNull();
      });

      // Re-enter edit mode
      await userEvent.keyboard("{i}");
      await waitFor(() => {
        const input = result.container.querySelector("input");
        expect(input).toBeTruthy();
        expect((input as HTMLInputElement).value).toBe("");
      });

      // Press Delete - should NOT delete because there's no next lifelog
      await userEvent.keyboard("{Delete}");

      // Wait a bit to ensure nothing happens
      await new Promise((r) => setTimeout(r, 100));

      // Should still be on same lifelog
      const input = result.container.querySelector("input");
      expect(input).toBeTruthy();

      // Exit editing mode
      await userEvent.keyboard("{Escape}");
      await waitFor(() => {
        expect(result.container.querySelector("input")).toBeNull();
      });

      // All lifelogs should still exist
      const listItems = result.container.querySelectorAll("li");
      expect(listItems.length).toBe(3);

      result.unmount();
    });
  });
});
