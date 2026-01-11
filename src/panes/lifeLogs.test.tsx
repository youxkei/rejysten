import { render, waitFor } from "@solidjs/testing-library";
import { doc, Timestamp, writeBatch } from "firebase/firestore";
import { onMount, Suspense } from "solid-js";
import { describe, expect, vi } from "vitest";
import { userEvent } from "vitest/browser";

import { LifeLogs } from "@/panes/lifeLogs";
import { FirebaseServiceProvider } from "@/services/firebase";
import {
  FirestoreServiceProvider,
  getCollection,
  singletonDocumentId,
  useFirestoreService,
} from "@/services/firebase/firestore";
import { StoreServiceProvider, useStoreService } from "@/services/store";
import { styles } from "@/styles.css";
import { testWithDb as it, type DatabaseInfo } from "@/test";
import { noneTimestamp } from "@/timestamp";

const baseTime = new Date(2026, 0, 10, 12, 0, 0, 0);

vi.mock(import("@/date"), async (importOriginal) => {
  const mod = await importOriginal();

  return {
    ...mod,
    NewDate: () => baseTime,
    DateNow: () => baseTime.getTime(),
  };
});

async function setupLifeLogsTest(testId: string, db: DatabaseInfo) {
  let resolveReady: () => void;
  let rejectReady: (error: unknown) => void;
  const ready = new Promise<void>((resolve, reject) => {
    resolveReady = resolve;
    rejectReady = reject;
  });

  const result = render(() => (
    <StoreServiceProvider localStorageNamePostfix={testId}>
      <FirebaseServiceProvider
        configYAML={`{ apiKey: "apiKey", authDomain: "authDomain", projectId: "demo", storageBucket: "", messagingSenderId: "", appId: "", measurementId: "" }`}
        setErrors={() => {}}
        appName={testId}
      >
        <FirestoreServiceProvider emulatorPort={db.emulatorPort}>
          <Suspense fallback={<span>loading....</span>}>
            {(() => {
              const firestore = useFirestoreService();
              const batchVersion = getCollection(firestore, "batchVersion");
              const lifeLogs = getCollection(firestore, "lifeLogs");
              const lifeLogTreeNodes = getCollection(firestore, "lifeLogTreeNodes");
              const { updateState } = useStoreService();

              onMount(() => {
                (async () => {
                  const batch = writeBatch(firestore.firestore);

                  batch.set(doc(batchVersion, singletonDocumentId), {
                    version: "__INITIAL__",
                    prevVersion: "",
                    createdAt: Timestamp.fromDate(baseTime),
                    updatedAt: Timestamp.fromDate(baseTime),
                  });

                  // First lifelog - with specific time
                  const startTime1 = new Date(baseTime);
                  startTime1.setHours(10, 30, 0, 0);

                  batch.set(doc(lifeLogs, "$log1"), {
                    text: "first lifelog",
                    startAt: Timestamp.fromDate(startTime1),
                    endAt: noneTimestamp,
                    createdAt: Timestamp.fromDate(baseTime),
                    updatedAt: Timestamp.fromDate(baseTime),
                  });

                  // Second lifelog - later time
                  const startTime2 = new Date(baseTime);
                  startTime2.setHours(12, 0, 0, 0);

                  batch.set(doc(lifeLogs, "$log2"), {
                    text: "second lifelog",
                    startAt: Timestamp.fromDate(startTime2),
                    endAt: noneTimestamp,
                    createdAt: Timestamp.fromDate(baseTime),
                    updatedAt: Timestamp.fromDate(baseTime),
                  });

                  // Create three sibling tree nodes under $log1
                  // child1 (has children), child2 (no children), child3 (has children)
                  batch.set(doc(lifeLogTreeNodes, "child1"), {
                    text: "first child",
                    parentId: "$log1",
                    order: "a0",
                    createdAt: Timestamp.fromDate(baseTime),
                    updatedAt: Timestamp.fromDate(baseTime),
                  });

                  batch.set(doc(lifeLogTreeNodes, "child2"), {
                    text: "second child",
                    parentId: "$log1",
                    order: "a1",
                    createdAt: Timestamp.fromDate(baseTime),
                    updatedAt: Timestamp.fromDate(baseTime),
                  });

                  batch.set(doc(lifeLogTreeNodes, "child3"), {
                    text: "third child",
                    parentId: "$log1",
                    order: "a2",
                    createdAt: Timestamp.fromDate(baseTime),
                    updatedAt: Timestamp.fromDate(baseTime),
                  });

                  // Create a grandchild node under child1 for deep navigation tests
                  batch.set(doc(lifeLogTreeNodes, "grandchild1"), {
                    text: "grandchild",
                    parentId: "child1",
                    order: "a0",
                    createdAt: Timestamp.fromDate(baseTime),
                    updatedAt: Timestamp.fromDate(baseTime),
                  });

                  // Create a great-grandchild node under grandchild1 for deeper navigation tests
                  batch.set(doc(lifeLogTreeNodes, "greatGrandchild1"), {
                    text: "great-grandchild",
                    parentId: "grandchild1",
                    order: "a0",
                    createdAt: Timestamp.fromDate(baseTime),
                    updatedAt: Timestamp.fromDate(baseTime),
                  });

                  // Create a grandchild node under child3 to give child3 children
                  // This enables testing "Delete when next node has children"
                  batch.set(doc(lifeLogTreeNodes, "grandchild3"), {
                    text: "third grandchild",
                    parentId: "child3",
                    order: "a0",
                    createdAt: Timestamp.fromDate(baseTime),
                    updatedAt: Timestamp.fromDate(baseTime),
                  });

                  // Third lifelog - with noneTimestamp startAt for S key test
                  batch.set(doc(lifeLogs, "$log3"), {
                    text: "third lifelog",
                    startAt: noneTimestamp,
                    endAt: noneTimestamp,
                    createdAt: Timestamp.fromDate(baseTime),
                    updatedAt: Timestamp.fromDate(baseTime),
                  });

                  await batch.commit();

                  updateState((state) => {
                    state.panesLifeLogs.selectedLifeLogId = "$log1";
                  });
                })().then(resolveReady, rejectReady);
              });

              return <LifeLogs />;
            })()}
          </Suspense>
        </FirestoreServiceProvider>
      </FirebaseServiceProvider>
    </StoreServiceProvider>
  ));

  await ready;

  return {
    result,
  };
}

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

  describe("LifeLogTree", () => {
    it("can enter/exit tree mode with l/h keys", async ({ db, task }) => {
      const { result } = await setupLifeLogsTest(task.id, db);

      await result.findByText("first lifelog");

      // Initial state: $log1 is selected (lifelog mode)
      await waitFor(() => {
        const log1Element = result.getByText("first lifelog").closest(`.${styles.lifeLogTree.container}`);
        expect(log1Element?.className).toContain(styles.lifeLogTree.selected);
      });

      // Press "l" to enter tree mode
      await userEvent.keyboard("{l}");

      // Wait for tree nodes to render and first child to be selected
      await result.findByText("first child");
      await waitFor(() => {
        const child1Element = result.getByText("first child");
        expect(child1Element.className).toContain(styles.lifeLogTree.selected);
      });

      // Lifelog should no longer be selected (tree node is selected instead)
      const log1Element = result.getByText("first lifelog").closest(`.${styles.lifeLogTree.container}`);
      expect(log1Element?.className).not.toContain(styles.lifeLogTree.selected);

      // Press "h" to exit tree mode and go back to lifelog
      await userEvent.keyboard("{h}");

      await waitFor(() => {
        const log1ElementAfter = result.getByText("first lifelog").closest(`.${styles.lifeLogTree.container}`);
        expect(log1ElementAfter?.className).toContain(styles.lifeLogTree.selected);
      });

      // Tree nodes should no longer be visible (tree mode exited)
      await waitFor(() => {
        expect(result.queryByText("first child")).toBeNull();
      });

      result.unmount();
    });

    it("can navigate between tree nodes with j/k keys", async ({ db, task }) => {
      const { result } = await setupLifeLogsTest(task.id, db);

      await result.findByText("first lifelog");

      // Press "l" to enter tree mode
      await userEvent.keyboard("{l}");

      // Wait for all tree nodes to render
      // Structure (depth):
      //   child1 (depth 1)
      //     grandchild (depth 2)
      //       great-grandchild (depth 3)
      //   child2 (depth 1)
      await result.findByText("first child");
      await result.findByText("grandchild");
      await result.findByText("great-grandchild");
      await result.findByText("second child");

      // Initial state: child1 (depth 1) is selected
      await waitFor(() => {
        const child1Element = result.getByText("first child");
        expect(child1Element.className).toContain(styles.lifeLogTree.selected);
      });

      // Test j: shallow -> deep (depth 1 -> depth 2)
      await userEvent.keyboard("{j}");

      await waitFor(() => {
        const grandchildElement = result.getByText("grandchild");
        expect(grandchildElement.className).toContain(styles.lifeLogTree.selected);
      });

      // Test j: deep -> deeper (depth 2 -> depth 3)
      await userEvent.keyboard("{j}");

      await waitFor(() => {
        const greatGrandchildElement = result.getByText("great-grandchild");
        expect(greatGrandchildElement.className).toContain(styles.lifeLogTree.selected);
      });

      // Test j: deepest -> shallow (depth 3 -> depth 1)
      await userEvent.keyboard("{j}");

      await waitFor(() => {
        const child2Element = result.getByText("second child");
        expect(child2Element.className).toContain(styles.lifeLogTree.selected);
      });

      // Test k: shallow -> deepest (depth 1 -> depth 3)
      await userEvent.keyboard("{k}");

      await waitFor(() => {
        const greatGrandchildElement = result.getByText("great-grandchild");
        expect(greatGrandchildElement.className).toContain(styles.lifeLogTree.selected);
      });

      // Test k: deepest -> deep (depth 3 -> depth 2)
      await userEvent.keyboard("{k}");

      await waitFor(() => {
        const grandchildElement = result.getByText("grandchild");
        expect(grandchildElement.className).toContain(styles.lifeLogTree.selected);
      });

      // Test k: deep -> shallow (depth 2 -> depth 1)
      await userEvent.keyboard("{k}");

      await waitFor(() => {
        const child1Element = result.getByText("first child");
        expect(child1Element.className).toContain(styles.lifeLogTree.selected);
      });

      // Press "k" at the first node should not change selection
      await userEvent.keyboard("{k}");

      await waitFor(() => {
        const child1Element = result.getByText("first child");
        expect(child1Element.className).toContain(styles.lifeLogTree.selected);
      });

      // Exit tree mode to ensure clean shutdown
      await userEvent.keyboard("{h}");
      await waitFor(() => {
        // After pressing h, tree nodes should no longer be visible
        expect(result.queryByText("first child")).toBeNull();
      });

      result.unmount();
    });

    it("can indent/dedent nodes with Tab/Shift+Tab keys", async ({ db, task }) => {
      const { result } = await setupLifeLogsTest(task.id, db);

      // Wait for lifelogs to render
      await result.findByText("first lifelog");

      // Press "l" to enter tree mode (focus on first child node - child1)
      await userEvent.keyboard("{l}");

      // Wait for tree nodes to render
      await result.findByText("first child");
      await result.findByText("second child");

      // Press "j" three times to move to child2 (child1 -> grandchild -> great-grandchild -> child2)
      await userEvent.keyboard("{j}");
      await waitFor(() => {
        const grandchildElement = result.getByText("grandchild");
        expect(grandchildElement.className).toContain(styles.lifeLogTree.selected);
      });
      await userEvent.keyboard("{j}");
      await waitFor(() => {
        const greatGrandchildElement = result.getByText("great-grandchild");
        expect(greatGrandchildElement.className).toContain(styles.lifeLogTree.selected);
      });
      await userEvent.keyboard("{j}");

      // Wait for child2 to be selected
      await waitFor(() => {
        const child2Element = result.getByText("second child");
        expect(child2Element.className).toContain(styles.lifeLogTree.selected);
      });

      // Verify initial DOM structure: child1 and child2 are siblings (both direct children of the same ul)
      const child1Li = result.getByText("first child").closest("li")!;
      const child2Li = result.getByText("second child").closest("li")!;
      const parentUl = child1Li.parentElement!;
      expect(parentUl.tagName).toBe("UL");
      expect(child2Li.parentElement).toBe(parentUl); // child2 is sibling of child1

      // Test indent: Press Tab to indent child2 under child1
      const indentStart = performance.now();
      await userEvent.keyboard("{Tab}");

      // Verify DOM structure after indent: child2 should be inside child1's subtree
      await waitFor(() => {
        const child1LiAfterIndent = result.getByText("first child").closest("li")!;
        const child2LiAfterIndent = result.getByText("second child").closest("li")!;
        // child2 should now be nested inside child1 (child1's li contains a ul that contains child2's li)
        expect(child1LiAfterIndent.contains(child2LiAfterIndent)).toBe(true);
      });
      const indentEnd = performance.now();
      const indentDuration = indentEnd - indentStart;

      // Test dedent: Press Shift+Tab to dedent child2 back to sibling of child1
      const dedentStart = performance.now();
      await userEvent.keyboard("{Shift>}{Tab}{/Shift}");

      // Verify DOM structure after dedent: child2 should be sibling of child1 again
      await waitFor(() => {
        const child1LiAfterDedent = result.getByText("first child").closest("li")!;
        const child2LiAfterDedent = result.getByText("second child").closest("li")!;
        // child2 should no longer be nested inside child1
        expect(child1LiAfterDedent.contains(child2LiAfterDedent)).toBe(false);
        // They should share the same parent ul
        expect(child1LiAfterDedent.parentElement).toBe(child2LiAfterDedent.parentElement);
      });
      const dedentEnd = performance.now();
      const dedentDuration = dedentEnd - dedentStart;

      // Assert each operation completes within 100ms
      expect(indentDuration, `Indent took ${indentDuration.toFixed(2)}ms`).toBeLessThan(100);
      expect(dedentDuration, `Dedent took ${dedentDuration.toFixed(2)}ms`).toBeLessThan(100);

      result.unmount();
    });

    it("can edit node text with i key", async ({ db, task }) => {
      const { result } = await setupLifeLogsTest(task.id, db);

      await result.findByText("first lifelog");

      // Press "l" to enter tree mode (focus on first child node - child1)
      await userEvent.keyboard("{l}");

      // Wait for tree nodes to render
      await result.findByText("first child");

      // Press "i" to enter editing mode
      await userEvent.keyboard("{i}");

      // Wait for input to appear
      await waitFor(() => {
        const input = result.container.querySelector("input");
        expect(input).toBeTruthy();
      });

      const input = result.container.querySelector("input") as HTMLInputElement;

      // Test cursor position is preserved while typing
      // Type a character in the middle (position 5)
      input.focus();
      input.setSelectionRange(5, 5);
      await userEvent.keyboard("X");

      await waitFor(() => {
        expect(input.value).toBe("firstX child");
      });

      // Verify cursor position can be set and preserved
      // (In a controlled component with value={}, setting cursor position would be reset on next render)
      input.setSelectionRange(6, 6);
      expect(input.selectionStart).toBe(6);

      // Type another character at position 6
      await userEvent.keyboard("Y");

      await waitFor(() => {
        expect(input.value).toBe("firstXY child");
      });

      // Verify setSelectionRange still works after input
      input.setSelectionRange(3, 3);
      expect(input.selectionStart).toBe(3);
      expect(input.selectionEnd).toBe(3);

      // Press Escape to save and exit editing
      const start = performance.now();
      await userEvent.keyboard("{Escape}");

      // Verify the DOM was updated
      await waitFor(() => {
        expect(result.getByText("firstXY child")).toBeTruthy();
      });
      const end = performance.now();
      const duration = end - start;

      expect(duration, `Edit node text took ${duration.toFixed(2)}ms`).toBeLessThan(100);
      expect(result.queryByText("first child")).toBeNull();

      result.unmount();
    });

    it("can add node below with o key", async ({ db, task }) => {
      const { result } = await setupLifeLogsTest(task.id, db);

      await result.findByText("first lifelog");

      // Press "l" to enter tree mode
      await userEvent.keyboard("{l}");

      // Wait for tree nodes to render
      await result.findByText("first child");

      // Initial state: child1 is selected
      await waitFor(() => {
        const child1Element = result.getByText("first child");
        expect(child1Element.className).toContain(styles.lifeLogTree.selected);
      });

      // Press "o" to add a new node below
      const start = performance.now();
      await userEvent.keyboard("{o}");

      // Wait for input to appear (editing mode)
      await waitFor(() => {
        const input = result.container.querySelector("input");
        expect(input).toBeTruthy();
      });
      const end = performance.now();
      const duration = end - start;

      // Assert operation completes within 100ms
      expect(duration, `Add node below took ${duration.toFixed(2)}ms`).toBeLessThan(100);

      // Type text for the new node
      const input = result.container.querySelector("input")!;
      input.focus();
      await userEvent.keyboard("new node below");

      // Press Escape to save and exit editing
      await userEvent.keyboard("{Escape}");

      // Verify the new node is displayed
      await waitFor(() => {
        expect(result.getByText("new node below")).toBeTruthy();
      });

      // Verify the order: first child should come before new node below
      const firstChildLi = result.getByText("first child").closest("li")!;
      const newNodeLi = result.getByText("new node below").closest("li")!;
      // They should be siblings (same parent)
      expect(firstChildLi.parentElement).toBe(newNodeLi.parentElement);
      // first child should come before new node in DOM order
      const children = Array.from(firstChildLi.parentElement!.children);
      expect(children.indexOf(firstChildLi)).toBeLessThan(children.indexOf(newNodeLi));

      result.unmount();
    });

    it("can add node above with O key", async ({ db, task }) => {
      const { result } = await setupLifeLogsTest(task.id, db);

      await result.findByText("first lifelog");

      // Press "l" to enter tree mode
      await userEvent.keyboard("{l}");

      // Wait for tree nodes to render
      await result.findByText("second child");

      // Navigate to second child (j -> j -> j to skip grandchild and great-grandchild)
      await userEvent.keyboard("{j}");
      await waitFor(() => {
        expect(result.getByText("grandchild").className).toContain(styles.lifeLogTree.selected);
      });
      await userEvent.keyboard("{j}");
      await waitFor(() => {
        expect(result.getByText("great-grandchild").className).toContain(styles.lifeLogTree.selected);
      });
      await userEvent.keyboard("{j}");
      await waitFor(() => {
        expect(result.getByText("second child").className).toContain(styles.lifeLogTree.selected);
      });

      // Press Shift+O to add a new node above
      const start = performance.now();
      await userEvent.keyboard("{Shift>}{o}{/Shift}");

      // Wait for input to appear (editing mode)
      await waitFor(() => {
        const input = result.container.querySelector("input");
        expect(input).toBeTruthy();
      });
      const end = performance.now();
      const duration = end - start;

      expect(duration, `Add node above took ${duration.toFixed(2)}ms`).toBeLessThan(100);

      // Type text for the new node
      const input = result.container.querySelector("input")!;
      input.focus();
      await userEvent.keyboard("new node above");

      // Press Escape to save and exit editing
      await userEvent.keyboard("{Escape}");

      // Verify the new node is displayed
      await waitFor(() => {
        expect(result.getByText("new node above")).toBeTruthy();
      });

      // Verify the order: new node above should come before second child
      const newNodeLi = result.getByText("new node above").closest("li")!;
      const secondChildLi = result.getByText("second child").closest("li")!;
      // They should be siblings (same parent)
      expect(newNodeLi.parentElement).toBe(secondChildLi.parentElement);
      // new node should come before second child in DOM order
      const children = Array.from(newNodeLi.parentElement!.children);
      expect(children.indexOf(newNodeLi)).toBeLessThan(children.indexOf(secondChildLi));

      result.unmount();
    });

    it("can split node with Enter key at cursor position", async ({ db, task }) => {
      const { result } = await setupLifeLogsTest(task.id, db);

      await result.findByText("first lifelog");

      // Press "l" to enter tree mode
      await userEvent.keyboard("{l}");

      // Wait for tree nodes to render
      await result.findByText("first child");

      // Initial state: child1 is selected
      await waitFor(() => {
        const child1Element = result.getByText("first child");
        expect(child1Element.className).toContain(styles.lifeLogTree.selected);
      });

      // Press "i" to enter editing mode
      await userEvent.keyboard("{i}");

      // Wait for input to appear
      await waitFor(() => {
        const input = result.container.querySelector("input");
        expect(input).toBeTruthy();
      });

      const input = result.container.querySelector("input")!;

      // Change text to "beforeafter" and set cursor position in the middle
      input.focus();
      await userEvent.keyboard("{Control>}a{/Control}beforeafter");

      // Set cursor position at index 6 (between "before" and "after")
      input.setSelectionRange(6, 6);

      // Press Enter to split the node
      const start = performance.now();
      await userEvent.keyboard("{Enter}");

      // Wait for the split to complete - original node should have "before"
      await waitFor(() => {
        expect(result.getByText("before")).toBeTruthy();
      });

      // New node should have "after" and be selected with editing mode
      // Cursor should be at position 0 (beginning of the text)
      await waitFor(() => {
        const input = result.container.querySelector("input") as HTMLInputElement;
        expect(input).toBeTruthy();
        expect(input.value).toBe("after");
        expect(input.selectionStart).toBe(0);
        expect(input.selectionEnd).toBe(0);
      });
      const end = performance.now();
      const duration = end - start;

      expect(duration, `Split node took ${duration.toFixed(2)}ms`).toBeLessThan(250);

      // Press Escape to exit editing mode
      await userEvent.keyboard("{Escape}");

      // Verify both nodes are displayed
      await waitFor(() => {
        expect(result.getByText("before")).toBeTruthy();
        expect(result.getByText("after")).toBeTruthy();
      });

      // Verify the order: "before" should come before "after"
      const beforeLi = result.getByText("before").closest("li")!;
      const afterLi = result.getByText("after").closest("li")!;
      // They should be siblings (same parent)
      expect(beforeLi.parentElement).toBe(afterLi.parentElement);
      // "before" should come before "after" in DOM order
      const children = Array.from(beforeLi.parentElement!.children);
      expect(children.indexOf(beforeLi)).toBeLessThan(children.indexOf(afterLi));

      result.unmount();
    });

    it("can add empty node below with Enter key at end of text", async ({ db, task }) => {
      const { result } = await setupLifeLogsTest(task.id, db);

      await result.findByText("first lifelog");

      // Press "l" to enter tree mode
      await userEvent.keyboard("{l}");

      // Wait for tree nodes to render
      await result.findByText("first child");

      // Press "i" to enter editing mode
      await userEvent.keyboard("{i}");

      // Wait for input to appear
      await waitFor(() => {
        const input = result.container.querySelector("input");
        expect(input).toBeTruthy();
      });

      const input = result.container.querySelector("input")!;

      // Set cursor position at end (after "first child")
      input.setSelectionRange(input.value.length, input.value.length);

      // Press Enter to add new node below
      await userEvent.keyboard("{Enter}");

      // Wait for new node - original node should still have "first child"
      await waitFor(() => {
        expect(result.getByText("first child")).toBeTruthy();
      });

      // New node should be selected with editing mode and empty value
      await waitFor(() => {
        const newInput = result.container.querySelector("input");
        expect(newInput).toBeTruthy();
        expect((newInput as HTMLInputElement).value).toBe("");
      });

      result.unmount();
    });

    it("can indent/dedent nodes with Tab/Shift+Tab keys during editing", async ({ db, task }) => {
      const { result } = await setupLifeLogsTest(task.id, db);

      await result.findByText("first lifelog");

      // Press "l" to enter tree mode
      await userEvent.keyboard("{l}");

      // Wait for tree nodes to render
      await result.findByText("first child");
      await result.findByText("second child");
      await result.findByText("grandchild");
      await result.findByText("great-grandchild");

      // Wait for initial selection
      await waitFor(() => {
        expect(result.getByText("first child").className).toContain(styles.lifeLogTree.selected);
      });

      // Navigate to child2 (j -> j -> j: child1 -> grandchild -> great-grandchild -> child2)
      await userEvent.keyboard("{j}");
      await waitFor(() => {
        expect(result.getByText("grandchild").className).toContain(styles.lifeLogTree.selected);
      });
      await userEvent.keyboard("{j}");
      await waitFor(() => {
        expect(result.getByText("great-grandchild").className).toContain(styles.lifeLogTree.selected);
      });
      await userEvent.keyboard("{j}");
      await waitFor(() => {
        expect(result.getByText("second child").className).toContain(styles.lifeLogTree.selected);
      });

      // Press "a" to enter editing mode (cursor at end, like vim's append)
      await userEvent.keyboard("{a}");

      // Wait for input to appear
      await waitFor(() => {
        const input = result.container.querySelector("input");
        expect(input).toBeTruthy();
      });

      // Type some text to modify (appends to end: "second child" -> "second child edited")
      await userEvent.keyboard(" edited");

      // Verify initial DOM structure: child1 and child2 are siblings
      const child1Li = result.getByText("first child").closest("li")!;
      const child2Li = result.container.querySelector("input")!.closest("li")!;
      expect(child1Li.parentElement).toBe(child2Li.parentElement);

      // Press Tab to indent while editing
      await userEvent.keyboard("{Tab}");

      // Verify text was saved and indent happened
      // Note: After Tab, we're still in editing mode, so the text is in the input field
      await waitFor(() => {
        const input = result.container.querySelector("input") as HTMLInputElement;
        expect(input).toBeTruthy();
        expect(input.value).toBe("second child edited");
        // Verify indent happened: input's li should be inside first child's li
        const child1LiAfterIndent = result.getByText("first child").closest("li")!;
        const inputLiAfterIndent = input.closest("li")!;
        expect(child1LiAfterIndent.contains(inputLiAfterIndent)).toBe(true);
      });

      // Press Shift+Tab to dedent while editing
      await userEvent.keyboard("{Shift>}{Tab}{/Shift}");

      // Verify dedent happened
      await waitFor(() => {
        const input = result.container.querySelector("input") as HTMLInputElement;
        expect(input).toBeTruthy();
        expect(input.value).toBe("second child edited");
        // Verify dedent happened: input's li should be sibling of first child's li
        const child1LiAfterDedent = result.getByText("first child").closest("li")!;
        const inputLiAfterDedent = input.closest("li")!;
        expect(child1LiAfterDedent.contains(inputLiAfterDedent)).toBe(false);
        expect(child1LiAfterDedent.parentElement).toBe(inputLiAfterDedent.parentElement);
      });

      result.unmount();
    });

    it("preserves cursor position after Tab indent/dedent during editing", async ({ db, task }) => {
      const { result } = await setupLifeLogsTest(task.id, db);

      await result.findByText("first lifelog");

      // Press "l" to enter tree mode
      await userEvent.keyboard("{l}");

      // Wait for tree nodes to render
      await result.findByText("first child");
      await result.findByText("second child");
      await result.findByText("grandchild");
      await result.findByText("great-grandchild");

      // Wait for initial selection
      await waitFor(() => {
        expect(result.getByText("first child").className).toContain(styles.lifeLogTree.selected);
      });

      // Navigate to child2 (j -> j -> j: child1 -> grandchild -> great-grandchild -> child2)
      await userEvent.keyboard("{j}");
      await waitFor(() => {
        expect(result.getByText("grandchild").className).toContain(styles.lifeLogTree.selected);
      });
      await userEvent.keyboard("{j}");
      await waitFor(() => {
        expect(result.getByText("great-grandchild").className).toContain(styles.lifeLogTree.selected);
      });
      await userEvent.keyboard("{j}");
      await waitFor(() => {
        expect(result.getByText("second child").className).toContain(styles.lifeLogTree.selected);
      });

      // Press "i" to enter editing mode
      await userEvent.keyboard("{i}");

      // Wait for input
      await waitFor(() => {
        const input = result.container.querySelector("input");
        expect(input).toBeTruthy();
      });

      const input = result.container.querySelector("input") as HTMLInputElement;

      // Set cursor position in the middle (position 6)
      input.setSelectionRange(6, 6);
      expect(input.selectionStart).toBe(6);

      // Press Tab to indent
      await userEvent.keyboard("{Tab}");

      // Wait for indent to complete and verify cursor position is preserved
      await waitFor(() => {
        const inputAfter = result.container.querySelector("input") as HTMLInputElement;
        expect(inputAfter).toBeTruthy();
        expect(inputAfter.selectionStart).toBe(6);
      });

      // Exit editing mode before unmount to ensure clean shutdown
      await userEvent.keyboard("{Escape}");
      await waitFor(() => {
        expect(result.container.querySelector("input")).toBeNull();
      });

      result.unmount();
    });

    it("can merge nodes with Backspace at beginning of node", async ({ db, task }) => {
      const { result } = await setupLifeLogsTest(task.id, db);

      await result.findByText("first lifelog");

      // Press "l" to enter tree mode
      await userEvent.keyboard("{l}");

      // Wait for tree nodes to render
      await result.findByText("first child");
      await result.findByText("second child");
      await result.findByText("grandchild");
      await result.findByText("great-grandchild");

      // Wait for initial selection
      await waitFor(() => {
        expect(result.getByText("first child").className).toContain(styles.lifeLogTree.selected);
      });

      // Navigate to child2 (j -> j -> j: child1 -> grandchild -> great-grandchild -> child2)
      await userEvent.keyboard("{j}");
      await waitFor(() => {
        expect(result.getByText("grandchild").className).toContain(styles.lifeLogTree.selected);
      });
      await userEvent.keyboard("{j}");
      await waitFor(() => {
        expect(result.getByText("great-grandchild").className).toContain(styles.lifeLogTree.selected);
      });
      await userEvent.keyboard("{j}");
      await waitFor(() => {
        expect(result.getByText("second child").className).toContain(styles.lifeLogTree.selected);
      });

      // Press "i" to enter editing mode (cursor at beginning)
      await userEvent.keyboard("{i}");

      // Wait for input to appear
      await waitFor(() => {
        const input = result.container.querySelector("input");
        expect(input).toBeTruthy();
        expect((input as HTMLInputElement).value).toBe("second child");
        expect((input as HTMLInputElement).selectionStart).toBe(0);
      });

      // Press Backspace at beginning - should merge with previous node (great-grandchild)
      await userEvent.keyboard("{Backspace}");

      // Wait for merge to complete
      await waitFor(() => {
        const input = result.container.querySelector("input") as HTMLInputElement;
        expect(input).toBeTruthy();
        // Merged text: "great-grandchild" + "second child" = "great-grandchildsecond child"
        expect(input.value).toBe("great-grandchildsecond child");
        // Cursor should be at the join point (length of "great-grandchild" = 16)
        expect(input.selectionStart).toBe(16);
      });

      // Verify "second child" node is gone
      await waitFor(() => {
        expect(result.queryByText("second child")).toBeNull();
      });

      // Exit editing mode
      await userEvent.keyboard("{Escape}");
      await waitFor(() => {
        expect(result.container.querySelector("input")).toBeNull();
      });

      // Verify merged text is displayed
      expect(result.getByText("great-grandchildsecond child")).toBeTruthy();

      result.unmount();
    });

    it("can delete only empty node with Backspace and move cursor to LifeLog text", async ({ db, task }) => {
      const { result } = await setupLifeLogsTest(task.id, db);

      // Navigate to $log2 (has text "second lifelog", no tree nodes)
      await result.findByText("first lifelog");
      await userEvent.keyboard("{j}"); // Move to $log2
      await waitFor(() => {
        const log2Element = result.getByText("second lifelog").closest(`.${styles.lifeLogTree.container}`);
        expect(log2Element?.className).toContain(styles.lifeLogTree.selected);
      });

      // Press "l" to create a tree node with text "new"
      await userEvent.keyboard("{l}");
      await waitFor(() => {
        expect(result.getByText("new").className).toContain(styles.lifeLogTree.selected);
      });

      // Press "a" to enter edit mode at end
      await userEvent.keyboard("{a}");
      await waitFor(() => {
        const input = result.container.querySelector("input");
        expect(input).toBeTruthy();
        expect((input as HTMLInputElement).value).toBe("new");
      });

      // Delete all text (Backspace 3 times: "new" -> "ne" -> "n" -> "")
      await userEvent.keyboard("{Backspace}{Backspace}{Backspace}");
      await waitFor(() => {
        const input = result.container.querySelector("input") as HTMLInputElement;
        expect(input.value).toBe("");
        expect(input.selectionStart).toBe(0);
      });

      // Press Backspace to delete the empty node
      await userEvent.keyboard("{Backspace}");

      // Verify: cursor is now in LifeLog text field at end
      await waitFor(() => {
        const input = result.container.querySelector("input") as HTMLInputElement;
        expect(input).toBeTruthy();
        expect(input.value).toBe("second lifelog");
        expect(input.selectionStart).toBe("second lifelog".length);
      });

      // Verify tree node is gone
      expect(result.queryByText("new")).toBeNull();

      result.unmount();
    });

    it("does not delete only node with Backspace if text is not empty", async ({ db, task }) => {
      const { result } = await setupLifeLogsTest(task.id, db);

      // Navigate to $log2 and create a tree node
      await result.findByText("first lifelog");
      await userEvent.keyboard("{j}");
      await userEvent.keyboard("{l}");
      await waitFor(() => {
        expect(result.getByText("new").className).toContain(styles.lifeLogTree.selected);
      });

      // Press "i" to enter edit mode at beginning
      await userEvent.keyboard("{i}");
      await waitFor(() => {
        const input = result.container.querySelector("input") as HTMLInputElement;
        expect(input.selectionStart).toBe(0);
      });

      // Press Backspace at position 0 with non-empty text
      await userEvent.keyboard("{Backspace}");

      // Wait for async handler to complete
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Verify: node still exists, text unchanged
      const input = result.container.querySelector("input") as HTMLInputElement;
      expect(input.value).toBe("new");

      // Exit editing mode
      await userEvent.keyboard("{Escape}");
      await waitFor(() => {
        expect(result.container.querySelector("input")).toBeNull();
      });

      result.unmount();
    });

    it("can merge nodes with Delete at end of node", async ({ db, task }) => {
      const { result } = await setupLifeLogsTest(task.id, db);

      await result.findByText("first lifelog");

      // Press "l" to enter tree mode
      await userEvent.keyboard("{l}");

      // Wait for tree nodes to render
      await result.findByText("first child");
      await result.findByText("second child");
      await result.findByText("grandchild");
      await result.findByText("great-grandchild");

      // Wait for initial selection
      await waitFor(() => {
        expect(result.getByText("first child").className).toContain(styles.lifeLogTree.selected);
      });

      // Navigate to great-grandchild (j -> j: child1 -> grandchild -> great-grandchild)
      await userEvent.keyboard("{j}");
      await waitFor(() => {
        expect(result.getByText("grandchild").className).toContain(styles.lifeLogTree.selected);
      });
      await userEvent.keyboard("{j}");
      await waitFor(() => {
        expect(result.getByText("great-grandchild").className).toContain(styles.lifeLogTree.selected);
      });

      // Press "a" to enter editing mode (cursor at end)
      await userEvent.keyboard("{a}");

      // Wait for input to appear
      await waitFor(() => {
        const input = result.container.querySelector("input");
        expect(input).toBeTruthy();
        expect((input as HTMLInputElement).value).toBe("great-grandchild");
        expect((input as HTMLInputElement).selectionStart).toBe(16);
      });

      // Press Delete at end - should merge with next node (second child)
      await userEvent.keyboard("{Delete}");

      // Wait for merge to complete
      await waitFor(() => {
        const input = result.container.querySelector("input") as HTMLInputElement;
        expect(input).toBeTruthy();
        // Merged text: "great-grandchild" + "second child" = "great-grandchildsecond child"
        expect(input.value).toBe("great-grandchildsecond child");
        // Cursor should stay at original position (16)
        expect(input.selectionStart).toBe(16);
      });

      // Verify "second child" node is gone
      await waitFor(() => {
        expect(result.queryByText("second child")).toBeNull();
      });

      // Exit editing mode
      await userEvent.keyboard("{Escape}");
      await waitFor(() => {
        expect(result.container.querySelector("input")).toBeNull();
      });

      // Verify merged text is displayed
      expect(result.getByText("great-grandchildsecond child")).toBeTruthy();

      result.unmount();
    });

    it("can merge with Delete even when current node has children (merges with first child)", async ({ db, task }) => {
      const { result } = await setupLifeLogsTest(task.id, db);

      await result.findByText("first lifelog");

      // Press "l" to enter tree mode
      await userEvent.keyboard("{l}");

      // Wait for tree nodes to render
      await result.findByText("first child");
      await result.findByText("grandchild");
      await result.findByText("great-grandchild");

      // Wait for initial selection on "first child" (which has children)
      await waitFor(() => {
        expect(result.getByText("first child").className).toContain(styles.lifeLogTree.selected);
      });

      // Navigate to grandchild (which has children - great-grandchild)
      await userEvent.keyboard("{j}");
      await waitFor(() => {
        expect(result.getByText("grandchild").className).toContain(styles.lifeLogTree.selected);
      });

      // Press "a" to enter editing mode (cursor at end)
      await userEvent.keyboard("{a}");

      // Wait for input to appear
      await waitFor(() => {
        const input = result.container.querySelector("input");
        expect(input).toBeTruthy();
        expect((input as HTMLInputElement).value).toBe("grandchild");
      });

      // Press Delete at end - SHOULD merge because next node (great-grandchild) has no children
      // Even though current node (grandchild) has children
      await userEvent.keyboard("{Delete}");

      // Wait for merge to complete
      await waitFor(() => {
        const input = result.container.querySelector("input") as HTMLInputElement;
        expect(input).toBeTruthy();
        // Merged text: "grandchild" + "great-grandchild" = "grandchildgreat-grandchild"
        expect(input.value).toBe("grandchildgreat-grandchild");
      });

      // "great-grandchild" node should be gone (merged into grandchild)
      await waitFor(() => {
        expect(result.queryByText("great-grandchild")).toBeNull();
      });

      // Exit editing mode
      await userEvent.keyboard("{Escape}");
      await waitFor(() => {
        expect(result.container.querySelector("input")).toBeNull();
      });

      result.unmount();
    });

    it("does not merge with Delete when first child (next node) has children", async ({ db, task }) => {
      const { result } = await setupLifeLogsTest(task.id, db);

      await result.findByText("first lifelog");

      // Press "l" to enter tree mode
      await userEvent.keyboard("{l}");

      // Wait for tree nodes to render
      await result.findByText("first child");
      await result.findByText("grandchild");

      // Wait for initial selection on "first child"
      await waitFor(() => {
        expect(result.getByText("first child").className).toContain(styles.lifeLogTree.selected);
      });

      // Press "a" to enter editing mode (cursor at end)
      await userEvent.keyboard("{a}");

      // Wait for input to appear
      await waitFor(() => {
        const input = result.container.querySelector("input");
        expect(input).toBeTruthy();
        expect((input as HTMLInputElement).value).toBe("first child");
      });

      // Press Delete at end - should NOT merge because next node (grandchild) has children
      await userEvent.keyboard("{Delete}");

      // Wait a bit and verify no merge happened
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Text should still be "first child" (no merge)
      const input = result.container.querySelector("input") as HTMLInputElement;
      expect(input.value).toBe("first child");

      // "grandchild" should still exist
      expect(result.queryByText("grandchild")).toBeTruthy();

      // Exit editing mode
      await userEvent.keyboard("{Escape}");
      await waitFor(() => {
        expect(result.container.querySelector("input")).toBeNull();
      });

      result.unmount();
    });

    it("does not merge when cursor is not at boundary", async ({ db, task }) => {
      const { result } = await setupLifeLogsTest(task.id, db);

      await result.findByText("first lifelog");

      // Press "l" to enter tree mode
      await userEvent.keyboard("{l}");

      // Wait for tree nodes to render
      await result.findByText("first child");
      await result.findByText("second child");
      await result.findByText("great-grandchild");

      // Wait for initial selection
      await waitFor(() => {
        expect(result.getByText("first child").className).toContain(styles.lifeLogTree.selected);
      });

      // Navigate to great-grandchild (j -> grandchild, j -> great-grandchild)
      await userEvent.keyboard("{j}");
      await waitFor(() => {
        expect(result.getByText("grandchild").className).toContain(styles.lifeLogTree.selected);
      });
      await userEvent.keyboard("{j}");
      await waitFor(() => {
        expect(result.getByText("great-grandchild").className).toContain(styles.lifeLogTree.selected);
      });

      // Press "i" to enter editing mode
      await userEvent.keyboard("{i}");

      // Wait for input
      await waitFor(() => {
        const input = result.container.querySelector("input");
        expect(input).toBeTruthy();
      });

      const input = result.container.querySelector("input") as HTMLInputElement;

      // Move cursor to middle position
      input.setSelectionRange(5, 5);

      // Press Backspace - should just delete character, not merge
      await userEvent.keyboard("{Backspace}");

      // Wait for normal backspace to work
      await waitFor(() => {
        const inputAfter = result.container.querySelector("input") as HTMLInputElement;
        // "great-grandchild" with char at position 4 deleted = "grea-grandchild"
        expect(inputAfter.value).toBe("grea-grandchild");
      });

      // "second child" should still exist
      expect(result.queryByText("second child")).toBeTruthy();

      // Exit editing mode before unmount to ensure clean shutdown
      await userEvent.keyboard("{Escape}");
      await waitFor(() => {
        expect(result.container.querySelector("input")).toBeNull();
      });

      result.unmount();
    });

    it("does not merge with Delete when next node has children", async ({ db, task }) => {
      const { result } = await setupLifeLogsTest(task.id, db);

      await result.findByText("first lifelog");

      // Press "l" to enter tree mode
      await userEvent.keyboard("{l}");

      // Wait for tree nodes to render
      await result.findByText("first child");
      await result.findByText("second child");
      await result.findByText("third child");

      // Wait for initial selection
      await waitFor(() => {
        expect(result.getByText("first child").className).toContain(styles.lifeLogTree.selected);
      });

      // Navigate to second child (j -> grandchild -> j -> great-grandchild -> j -> second child)
      await userEvent.keyboard("{j}");
      await waitFor(() => {
        expect(result.getByText("grandchild").className).toContain(styles.lifeLogTree.selected);
      });
      await userEvent.keyboard("{j}");
      await waitFor(() => {
        expect(result.getByText("great-grandchild").className).toContain(styles.lifeLogTree.selected);
      });
      await userEvent.keyboard("{j}");
      await waitFor(() => {
        expect(result.getByText("second child").className).toContain(styles.lifeLogTree.selected);
      });

      // Press "a" to enter editing mode (cursor at end)
      await userEvent.keyboard("{a}");

      // Wait for input to appear
      await waitFor(() => {
        const input = result.container.querySelector("input");
        expect(input).toBeTruthy();
        expect((input as HTMLInputElement).value).toBe("second child");
      });

      // Press Delete at end - should NOT merge because next node (third child) has children
      await userEvent.keyboard("{Delete}");

      // Wait a bit and verify no merge happened
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Text should still be "second child" (no merge)
      const input = result.container.querySelector("input") as HTMLInputElement;
      expect(input.value).toBe("second child");

      // "third child" should still exist
      expect(result.queryByText("third child")).toBeTruthy();

      // Exit editing mode before unmount
      await userEvent.keyboard("{Escape}");
      await waitFor(() => {
        expect(result.container.querySelector("input")).toBeNull();
      });

      result.unmount();
    });

    it("can merge with Backspace even when previous node has children", async ({ db, task }) => {
      const { result } = await setupLifeLogsTest(task.id, db);

      await result.findByText("first lifelog");

      // Press "l" to enter tree mode
      await userEvent.keyboard("{l}");

      // Wait for tree nodes to render
      await result.findByText("first child");
      await result.findByText("grandchild");
      await result.findByText("great-grandchild");

      // Wait for initial selection
      await waitFor(() => {
        expect(result.getByText("first child").className).toContain(styles.lifeLogTree.selected);
      });

      // Navigate to great-grandchild (j -> grandchild -> j -> great-grandchild)
      await userEvent.keyboard("{j}");
      await waitFor(() => {
        expect(result.getByText("grandchild").className).toContain(styles.lifeLogTree.selected);
      });
      await userEvent.keyboard("{j}");
      await waitFor(() => {
        expect(result.getByText("great-grandchild").className).toContain(styles.lifeLogTree.selected);
      });

      // Press "i" to enter editing mode (cursor at beginning)
      await userEvent.keyboard("{i}");

      // Wait for input to appear
      await waitFor(() => {
        const input = result.container.querySelector("input");
        expect(input).toBeTruthy();
        expect((input as HTMLInputElement).value).toBe("great-grandchild");
        expect((input as HTMLInputElement).selectionStart).toBe(0);
      });

      // Press Backspace at beginning - should merge even though previous node (grandchild) has children
      // We only check if current node has children, and great-grandchild has no children
      await userEvent.keyboard("{Backspace}");

      // Verify merge happened - now on grandchild with merged text
      await waitFor(() => {
        const input = result.container.querySelector("input") as HTMLInputElement;
        expect(input).toBeTruthy();
        expect(input.value).toBe("grandchildgreat-grandchild");
        expect(input.selectionStart).toBe("grandchild".length);
      });

      // "great-grandchild" should no longer exist as a separate node
      expect(result.queryByText("great-grandchild")).toBeNull();

      // Exit editing mode before unmount
      await userEvent.keyboard("{Escape}");
      await waitFor(() => {
        expect(result.container.querySelector("input")).toBeNull();
      });

      result.unmount();
    });
  });
});
