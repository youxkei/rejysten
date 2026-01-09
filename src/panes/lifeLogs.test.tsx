import { render, waitFor } from "@solidjs/testing-library";
import { doc, getDocs, Timestamp, writeBatch } from "firebase/firestore";
import { onMount, Suspense } from "solid-js";
import { describe, it, expect } from "vitest";
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
import { noneTimestamp } from "@/timestamp";

async function setupLifeLogsTest(testId: string) {
  let resolveReady: () => void;
  let rejectReady: (error: unknown) => void;
  const ready = new Promise<void>((resolve, reject) => {
    resolveReady = resolve;
    rejectReady = reject;
  });

  const baseTime: Date = new Date();

  const result = render(() => (
    <StoreServiceProvider localStorageNamePostfix={testId}>
      <FirebaseServiceProvider
        configYAML={`{ apiKey: "apiKey", authDomain: "authDomain", projectId: "demo", storageBucket: "", messagingSenderId: "", appId: "", measurementId: "" }`}
        setErrors={() => {}}
        appName={testId}
      >
        <FirestoreServiceProvider>
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

                  for (const lifeLog of (await getDocs(lifeLogs)).docs) {
                    batch.delete(lifeLog.ref);
                  }
                  for (const node of (await getDocs(lifeLogTreeNodes)).docs) {
                    batch.delete(node.ref);
                  }

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

                  // Create two sibling tree nodes under $log1
                  // child1 is first, child2 is second
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
    baseTime,
  };
}

function formatDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

describe("<LifeLogs />", () => {
  describe("LifeLog", () => {
    it("renders correctly", async (ctx) => {
      const { result, baseTime } = await setupLifeLogsTest(ctx.task.id);

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
      const dateStr = formatDate(baseTime);
      expect(result.getByText(`${dateStr} 10:30:00`)).toBeTruthy();
      expect(result.getByText(`${dateStr} 12:00:00`)).toBeTruthy();

      result.unmount();
    });

    it("can edit text with i key", async (ctx) => {
      const { result } = await setupLifeLogsTest(ctx.task.id);

      await result.findByText("first lifelog");

      // $log1 is already selected in setup, press "i" to enter editing mode
      await userEvent.keyboard("{i}");

      // Wait for input to appear and type new text
      await waitFor(() => {
        const input = result.container.querySelector("input");
        expect(input).toBeTruthy();
      });

      const input = result.container.querySelector("input")!;
      await userEvent.fill(input, "edited lifelog text");

      // Press Escape to save and exit editing
      const start = performance.now();
      await userEvent.keyboard("{Escape}");

      // Verify the DOM was updated
      await waitFor(() => {
        expect(result.getByText("edited lifelog text")).toBeTruthy();
      });
      const end = performance.now();
      const duration = end - start;

      expect(duration, `Edit text took ${duration.toFixed(2)}ms`).toBeLessThan(100);
      expect(result.queryByText("first lifelog")).toBeNull();

      result.unmount();
    });

    it("can set startAt to current time with s key", async (ctx) => {
      const { result } = await setupLifeLogsTest(ctx.task.id);

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

    it("can set endAt to current time with f key", async (ctx) => {
      const { result } = await setupLifeLogsTest(ctx.task.id);

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

    it("can navigate between lifelogs with j/k keys", async (ctx) => {
      const { result } = await setupLifeLogsTest(ctx.task.id);

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

    it("can add new lifelog with o key", async (ctx) => {
      const { result } = await setupLifeLogsTest(ctx.task.id);

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
      await userEvent.fill(input, "new lifelog from o key");

      // Press Escape to save and exit editing
      await userEvent.keyboard("{Escape}");

      // Verify the new lifelog text is displayed
      await waitFor(() => {
        expect(result.getByText("new lifelog from o key")).toBeTruthy();
      });

      result.unmount();
    });
  });

  describe("LifeLogTree", () => {
    it("can enter/exit tree mode with l/h keys", async (ctx) => {
      const { result } = await setupLifeLogsTest(ctx.task.id);

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

    it("can navigate between tree nodes with j/k keys", async (ctx) => {
      const { result } = await setupLifeLogsTest(ctx.task.id);

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

      result.unmount();
    });

    it("can indent/dedent nodes with Tab/Shift+Tab keys", async (ctx) => {
      const { result } = await setupLifeLogsTest(ctx.task.id);

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

    it("can edit node text with i key", async (ctx) => {
      const { result } = await setupLifeLogsTest(ctx.task.id);

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
      // Type a character in the middle
      const beforeCursor = input.value.slice(0, 5);
      const afterCursor = input.value.slice(5);
      await userEvent.fill(input, beforeCursor + "X" + afterCursor);

      await waitFor(() => {
        expect(input.value).toBe("firstX child");
      });

      // Verify cursor position can be set and preserved
      // (In a controlled component with value={}, setting cursor position would be reset on next render)
      input.setSelectionRange(6, 6);
      expect(input.selectionStart).toBe(6);

      // Type another character
      const value = input.value;
      await userEvent.fill(input, value.slice(0, 6) + "Y" + value.slice(6));

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

    it("can add node below with o key", async (ctx) => {
      const { result } = await setupLifeLogsTest(ctx.task.id);

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
      await userEvent.fill(input, "new node below");

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

    it("can add node above with O key", async (ctx) => {
      const { result } = await setupLifeLogsTest(ctx.task.id);

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
      await userEvent.fill(input, "new node above");

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

    it("can split node with Enter key at cursor position", async (ctx) => {
      const { result } = await setupLifeLogsTest(ctx.task.id);

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
      await userEvent.fill(input, "beforeafter");

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

    it("can add empty node below with Enter key at end of text", async (ctx) => {
      const { result } = await setupLifeLogsTest(ctx.task.id);

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
  });
});
