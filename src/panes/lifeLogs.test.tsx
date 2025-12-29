import { fireEvent, render, waitFor } from "@solidjs/testing-library";
import { doc, getDocs, Timestamp, writeBatch } from "firebase/firestore";
import { onMount, Suspense } from "solid-js";
import { describe, test, expect } from "vitest";

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
  test("it renders lifelog data correctly", async (ctx) => {
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

  test("it can indent/dedent tree nodes", async (ctx) => {
    const { result } = await setupLifeLogsTest(ctx.task.id);

    // Wait for lifelogs to render
    await result.findByText("first lifelog", {}, { timeout: 5000 });

    // Press "l" to enter tree mode (focus on first child node - child1)
    fireEvent.keyDown(document, { code: "KeyL", key: "l" });

    // Wait for tree nodes to render
    await result.findByText("first child", {}, { timeout: 5000 });
    await result.findByText("second child", {}, { timeout: 5000 });

    // Press "j" to move to child2
    fireEvent.keyDown(document, { code: "KeyJ", key: "j" });

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
    fireEvent.keyDown(document, { code: "Tab", key: "Tab" });

    // Verify DOM structure after indent: child2 should be inside child1's subtree
    await waitFor(() => {
      const child1LiAfterIndent = result.getByText("first child").closest("li")!;
      const child2LiAfterIndent = result.getByText("second child").closest("li")!;
      // child2 should now be nested inside child1 (child1's li contains a ul that contains child2's li)
      expect(child1LiAfterIndent.contains(child2LiAfterIndent)).toBe(true);
    });

    // Test dedent: Press Shift+Tab to dedent child2 back to sibling of child1
    fireEvent.keyDown(document, { code: "Tab", key: "Tab", shiftKey: true });

    // Verify DOM structure after dedent: child2 should be sibling of child1 again
    await waitFor(() => {
      const child1LiAfterDedent = result.getByText("first child").closest("li")!;
      const child2LiAfterDedent = result.getByText("second child").closest("li")!;
      // child2 should no longer be nested inside child1
      expect(child1LiAfterDedent.contains(child2LiAfterDedent)).toBe(false);
      // They should share the same parent ul
      expect(child1LiAfterDedent.parentElement).toBe(child2LiAfterDedent.parentElement);
    });

    result.unmount();
  });

  test("it can edit lifelog text", async (ctx) => {
    const { result } = await setupLifeLogsTest(ctx.task.id);

    await result.findByText("first lifelog", {}, { timeout: 5000 });

    // $log1 is already selected in setup, press "i" to enter editing mode
    fireEvent.keyDown(document, { code: "KeyI", key: "i" });

    // Wait for input to appear and type new text
    await waitFor(() => {
      const input = result.container.querySelector("input");
      expect(input).toBeTruthy();
    });

    const input = result.container.querySelector("input")!;
    fireEvent.input(input, { target: { value: "edited lifelog text" } });

    // Press Escape to save and exit editing
    fireEvent.keyDown(document, { code: "Escape", key: "Escape" });

    // Verify the DOM was updated
    await waitFor(() => {
      expect(result.getByText("edited lifelog text")).toBeTruthy();
    });
    expect(result.queryByText("first lifelog")).toBeNull();

    result.unmount();
  });

  test("it can set current time on startAt with S key", async (ctx) => {
    const { result } = await setupLifeLogsTest(ctx.task.id);

    await result.findByText("first lifelog", {}, { timeout: 5000 });
    await result.findByText("third lifelog", {}, { timeout: 5000 });

    // Navigate to $log3 which has noneTimestamp startAt
    // $log1 is selected, press "j" twice to get to $log3
    fireEvent.keyDown(document, { code: "KeyJ", key: "j" });
    fireEvent.keyDown(document, { code: "KeyJ", key: "j" });

    // Verify $log3 has N/A for startAt (initial state has 4 N/A: $log1 endAt, $log2 endAt, $log3 startAt, $log3 endAt)
    expect(result.getAllByText("N/A").length).toBe(4);

    // Press "S" to set current time on startAt
    fireEvent.keyDown(document, { code: "KeyS", key: "s" });

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

    result.unmount();
  });

  test("it can set current time on endAt with F key", async (ctx) => {
    const { result } = await setupLifeLogsTest(ctx.task.id);

    await result.findByText("first lifelog", {}, { timeout: 5000 });

    // $log1 is already selected and has endAt = noneTimestamp, so "F" key should work
    // Press "F" to set current time on endAt
    fireEvent.keyDown(document, { code: "KeyF", key: "f" });

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

    result.unmount();
  });

  test("it can edit lifeLogTree node text", async (ctx) => {
    const { result } = await setupLifeLogsTest(ctx.task.id);

    await result.findByText("first lifelog", {}, { timeout: 5000 });

    // Press "l" to enter tree mode (focus on first child node - child1)
    fireEvent.keyDown(document, { code: "KeyL", key: "l" });

    // Wait for tree nodes to render
    await result.findByText("first child", {}, { timeout: 5000 });

    // Press "i" to enter editing mode
    fireEvent.keyDown(document, { code: "KeyI", key: "i" });

    // Wait for input to appear
    await waitFor(() => {
      const input = result.container.querySelector("input");
      expect(input).toBeTruthy();
    });

    const input = result.container.querySelector("input")!;
    fireEvent.input(input, { target: { value: "edited child text" } });

    // Press Escape to save and exit editing
    fireEvent.keyDown(document, { code: "Escape", key: "Escape" });

    // Verify the DOM was updated
    await waitFor(() => {
      expect(result.getByText("edited child text")).toBeTruthy();
    });
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(result.queryByText("first child")).toBeNull();

    result.unmount();
  });

  test("it can move focus between lifelogs with j/k keys", async (ctx) => {
    const { result } = await setupLifeLogsTest(ctx.task.id);

    await result.findByText("first lifelog", {}, { timeout: 5000 });
    await result.findByText("second lifelog", {}, { timeout: 5000 });

    // Initial state: $log1 is selected
    await waitFor(() => {
      const log1Element = result.getByText("first lifelog").closest(`.${styles.lifeLogTree.container}`);
      expect(log1Element?.className).toContain(styles.lifeLogTree.selected);
    });

    // Press "j" to move to $log2
    fireEvent.keyDown(document, { code: "KeyJ", key: "j" });

    await waitFor(() => {
      const log2Element = result.getByText("second lifelog").closest(`.${styles.lifeLogTree.container}`);
      expect(log2Element?.className).toContain(styles.lifeLogTree.selected);
    });

    // Press "j" again to move to $log3
    fireEvent.keyDown(document, { code: "KeyJ", key: "j" });

    await waitFor(() => {
      const log3Element = result.getByText("third lifelog").closest(`.${styles.lifeLogTree.container}`);
      expect(log3Element?.className).toContain(styles.lifeLogTree.selected);
    });

    // Press "k" to move back to $log2
    fireEvent.keyDown(document, { code: "KeyK", key: "k" });

    await waitFor(() => {
      const log2Element = result.getByText("second lifelog").closest(`.${styles.lifeLogTree.container}`);
      expect(log2Element?.className).toContain(styles.lifeLogTree.selected);
    });

    // Press "k" to move back to $log1
    fireEvent.keyDown(document, { code: "KeyK", key: "k" });

    await waitFor(() => {
      const log1Element = result.getByText("first lifelog").closest(`.${styles.lifeLogTree.container}`);
      expect(log1Element?.className).toContain(styles.lifeLogTree.selected);
    });

    // Press "k" at the first item should not change selection
    fireEvent.keyDown(document, { code: "KeyK", key: "k" });

    await waitFor(() => {
      const log1Element = result.getByText("first lifelog").closest(`.${styles.lifeLogTree.container}`);
      expect(log1Element?.className).toContain(styles.lifeLogTree.selected);
    });

    result.unmount();
  });

  test("it can enter/exit tree mode with l/h keys", async (ctx) => {
    const { result } = await setupLifeLogsTest(ctx.task.id);

    await result.findByText("first lifelog", {}, { timeout: 5000 });

    // Initial state: $log1 is selected (lifelog mode)
    await waitFor(() => {
      const log1Element = result.getByText("first lifelog").closest(`.${styles.lifeLogTree.container}`);
      expect(log1Element?.className).toContain(styles.lifeLogTree.selected);
    });

    // Press "l" to enter tree mode
    fireEvent.keyDown(document, { code: "KeyL", key: "l" });

    // Wait for tree nodes to render and first child to be selected
    await result.findByText("first child", {}, { timeout: 5000 });
    await waitFor(() => {
      const child1Element = result.getByText("first child");
      expect(child1Element.className).toContain(styles.lifeLogTree.selected);
    });

    // Lifelog should no longer be selected (tree node is selected instead)
    const log1Element = result.getByText("first lifelog").closest(`.${styles.lifeLogTree.container}`);
    expect(log1Element?.className).not.toContain(styles.lifeLogTree.selected);

    // Press "h" to exit tree mode and go back to lifelog
    fireEvent.keyDown(document, { code: "KeyH", key: "h" });

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

  test("it can add a new lifelog with o key", async (ctx) => {
    const { result } = await setupLifeLogsTest(ctx.task.id);

    await result.findByText("first lifelog", {}, { timeout: 5000 });

    // Initial count of lifelogs
    const initialListItems = result.container.querySelectorAll(`.${styles.lifeLogs.listItem}`);
    expect(initialListItems.length).toBe(3);

    // Press "o" to add a new lifelog
    fireEvent.keyDown(document, { code: "KeyO", key: "o" });

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

    // Type text for the new lifelog
    const input = result.container.querySelector("input")!;
    fireEvent.input(input, { target: { value: "new lifelog from o key" } });

    // Press Escape to save and exit editing
    fireEvent.keyDown(document, { code: "Escape", key: "Escape" });

    // Verify the new lifelog text is displayed
    await waitFor(() => {
      expect(result.getByText("new lifelog from o key")).toBeTruthy();
    });

    result.unmount();
  });
});
