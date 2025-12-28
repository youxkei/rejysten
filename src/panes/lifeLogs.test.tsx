import { fireEvent, render, waitFor } from "@solidjs/testing-library";
import { doc, getDoc as getDoc, getDocs, Timestamp, writeBatch } from "firebase/firestore";
import { createSignal, onMount, Suspense } from "solid-js";
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

function setupLifeLogsTest(appName: string) {
  let firestoreRef: ReturnType<typeof useFirestoreService> | null = null;
  let updateStateRef: ReturnType<typeof useStoreService>["updateState"] | null = null;
  const [ready, setReady] = createSignal(false);

  const result = render(() => (
    <StoreServiceProvider>
      <FirebaseServiceProvider
        configYAML={`{ apiKey: "apiKey", authDomain: "authDomain", projectId: "demo", storageBucket: "", messagingSenderId: "", appId: "", measurementId: "" }`}
        setErrors={() => {}}
        appName={appName}
      >
        <FirestoreServiceProvider>
          <Suspense fallback={<span>loading....</span>}>
            {(() => {
              const firestore = useFirestoreService();
              firestoreRef = firestore;
              const batchVersion = getCollection(firestore, "batchVersion");
              const lifeLogs = getCollection(firestore, "lifeLogs");
              const lifeLogTreeNodes = getCollection(firestore, "lifeLogTreeNodes");
              const { updateState } = useStoreService();
              updateStateRef = updateState;

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
                    createdAt: Timestamp.fromDate(new Date()),
                    updatedAt: Timestamp.fromDate(new Date()),
                  });

                  const now = new Date();
                  // First lifelog - with specific time
                  const startTime1 = new Date(now);
                  startTime1.setHours(10, 30, 0, 0);

                  batch.set(doc(lifeLogs, "$log1"), {
                    text: "first lifelog",
                    startAt: Timestamp.fromDate(startTime1),
                    endAt: noneTimestamp,
                    createdAt: Timestamp.fromDate(now),
                    updatedAt: Timestamp.fromDate(now),
                  });

                  // Second lifelog - later time
                  const startTime2 = new Date(now);
                  startTime2.setHours(12, 0, 0, 0);

                  batch.set(doc(lifeLogs, "$log2"), {
                    text: "second lifelog",
                    startAt: Timestamp.fromDate(startTime2),
                    endAt: noneTimestamp,
                    createdAt: Timestamp.fromDate(now),
                    updatedAt: Timestamp.fromDate(now),
                  });

                  // Create two sibling tree nodes under $log1
                  // child1 is first, child2 is second
                  batch.set(doc(lifeLogTreeNodes, "child1"), {
                    text: "first child",
                    parentId: "$log1",
                    prevId: "",
                    nextId: "child2",
                    aboveId: "",
                    belowId: "child2",
                    createdAt: Timestamp.fromDate(now),
                    updatedAt: Timestamp.fromDate(now),
                  });

                  batch.set(doc(lifeLogTreeNodes, "child2"), {
                    text: "second child",
                    parentId: "$log1",
                    prevId: "child1",
                    nextId: "",
                    aboveId: "child1",
                    belowId: "",
                    createdAt: Timestamp.fromDate(now),
                    updatedAt: Timestamp.fromDate(now),
                  });

                  await batch.commit();

                  updateState((state) => {
                    state.panesLifeLogs.selectedLifeLogId = "$log1";
                  });

                  setReady(true);
                })().catch((error: unknown) => {
                  console.error("Error initializing Firestore data:", error);
                });
              });

              return <LifeLogs />;
            })()}
          </Suspense>
        </FirestoreServiceProvider>
      </FirebaseServiceProvider>
    </StoreServiceProvider>
  ));

  return {
    result,
    ready,
    getFirestoreRef: () => firestoreRef!,
    getUpdateStateRef: () => updateStateRef!,
  };
}

describe("<LifeLogs />", () => {
  test("it renders lifelog data correctly", async (ctx) => {
    const { result, ready } = setupLifeLogsTest(ctx.task.id);

    // Wait for setup to complete
    await waitFor(() => {
      expect(ready()).toBe(true);
    });

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
    expect(naElements.length).toBe(2); // Both lifelogs have noneTimestamp endAt

    // Test: time is displayed correctly (format: YYYY-MM-DD HH:MM:SS)
    expect(result.getByText(/10:30:00/)).toBeTruthy();
    expect(result.getByText(/12:00:00/)).toBeTruthy();

    result.unmount();
  });

  test("it can indent/dedent tree nodes", async (ctx) => {
    const { result, ready, getFirestoreRef, getUpdateStateRef } = setupLifeLogsTest(ctx.task.id);

    // Wait for setup to complete
    await waitFor(() => {
      expect(ready()).toBe(true);
    });

    // Wait for lifelogs to render
    await result.findByText("first lifelog", {}, { timeout: 5000 });

    // Focus on the tree by selecting a tree node (child2)
    getUpdateStateRef()((state) => {
      state.panesLifeLogs.selectedLifeLogNodeId = "child2";
    });

    // Wait for tree nodes to render (tree is shown when selectedLifeLogNodeId is set)
    await result.findByText("first child", {}, { timeout: 5000 });
    await result.findByText("second child", {}, { timeout: 5000 });

    // Verify initial state - child2 should be sibling of child1 (parentId = "$log1")
    const lifeLogTreeNodes = getCollection(getFirestoreRef(), "lifeLogTreeNodes");
    let child2Doc = await getDoc(doc(lifeLogTreeNodes, "child2"));
    expect(child2Doc.data()?.parentId).toBe("$log1");

    // Verify initial DOM structure: child1 and child2 are siblings (both direct children of the same ul)
    const child1Li = result.getByText("first child").closest("li")!;
    const child2Li = result.getByText("second child").closest("li")!;
    const parentUl = child1Li.parentElement!;
    expect(parentUl.tagName).toBe("UL");
    expect(child2Li.parentElement).toBe(parentUl); // child2 is sibling of child1

    // Test indent: Press Tab to indent child2 under child1
    fireEvent.keyDown(document, { code: "Tab", key: "Tab" });

    // Wait for indent to complete and verify child2 is now under child1
    await waitFor(async () => {
      child2Doc = await getDoc(doc(lifeLogTreeNodes, "child2"));
      expect(child2Doc.data()?.parentId).toBe("child1");
    });

    // Verify DOM structure after indent: child2 should be inside child1's subtree
    await waitFor(() => {
      const child1LiAfterIndent = result.getByText("first child").closest("li")!;
      const child2LiAfterIndent = result.getByText("second child").closest("li")!;
      // child2 should now be nested inside child1 (child1's li contains a ul that contains child2's li)
      expect(child1LiAfterIndent.contains(child2LiAfterIndent)).toBe(true);
    });

    // Test dedent: Press Shift+Tab to dedent child2 back to sibling of child1
    fireEvent.keyDown(document, { code: "Tab", key: "Tab", shiftKey: true });

    // Wait for dedent to complete and verify child2 is back to being sibling of child1
    await waitFor(async () => {
      child2Doc = await getDoc(doc(lifeLogTreeNodes, "child2"));
      expect(child2Doc.data()?.parentId).toBe("$log1");
    });

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
    const { result, ready, getFirestoreRef, getUpdateStateRef } = setupLifeLogsTest(ctx.task.id);

    await waitFor(() => {
      expect(ready()).toBe(true);
    });

    await result.findByText("first lifelog", {}, { timeout: 5000 });

    // Select the lifelog
    getUpdateStateRef()((state) => {
      state.panesLifeLogs.selectedLifeLogId = "$log1";
      state.panesLifeLogs.selectedLifeLogNodeId = "";
    });

    // Press "i" to enter editing mode
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

    // Verify the text was saved in DB
    const lifeLogsCol = getCollection(getFirestoreRef(), "lifeLogs");
    await waitFor(async () => {
      const log1Doc = await getDoc(doc(lifeLogsCol, "$log1"));
      expect(log1Doc.data()?.text).toBe("edited lifelog text");
    });

    // Verify the DOM was updated
    await waitFor(() => {
      expect(result.getByText("edited lifelog text")).toBeTruthy();
    });
    expect(result.queryByText("first lifelog")).toBeNull();

    result.unmount();
  });

  test("it can set current time on startAt with S key", async (ctx) => {
    const { result, ready, getFirestoreRef, getUpdateStateRef } = setupLifeLogsTest(ctx.task.id);

    await waitFor(() => {
      expect(ready()).toBe(true);
    });

    await result.findByText("first lifelog", {}, { timeout: 5000 });

    // First, set the lifelog's startAt to noneTimestamp so "S" key will work
    const lifeLogsCol = getCollection(getFirestoreRef(), "lifeLogs");
    const batch = writeBatch(getFirestoreRef().firestore);
    batch.update(doc(lifeLogsCol, "$log1"), { startAt: noneTimestamp });
    await batch.commit();

    // Wait for the change to propagate
    await waitFor(() => {
      const naElements = result.getAllByText("N/A");
      expect(naElements.length).toBe(3); // 2 from endAt + 1 from our updated startAt
    });

    // Select the lifelog
    getUpdateStateRef()((state) => {
      state.panesLifeLogs.selectedLifeLogId = "$log1";
      state.panesLifeLogs.selectedLifeLogNodeId = "";
    });

    // Press "S" to set current time on startAt
    const beforeTime = Date.now();
    fireEvent.keyDown(document, { code: "KeyS", key: "s" });

    // Verify startAt was set to approximately current time in DB
    await waitFor(async () => {
      const log1Doc = await getDoc(doc(lifeLogsCol, "$log1"));
      const startAt = log1Doc.data()?.startAt as Timestamp;
      const startAtMillis = startAt.toMillis();
      // The startAt should be close to the current time (within a few seconds)
      expect(startAtMillis).toBeGreaterThanOrEqual(Math.floor(beforeTime / 1000) * 1000 - 1000);
      expect(startAtMillis).toBeLessThanOrEqual(Date.now() + 1000);
    });

    // Verify DOM was updated - N/A count should go back to 2 (only endAt fields)
    await waitFor(() => {
      const naElements = result.getAllByText("N/A");
      expect(naElements.length).toBe(2);
    });

    // Verify the time is displayed in the DOM (should show current date-time format)
    await waitFor(() => {
      // The startAt should now show a time instead of N/A
      const timeRangeDiv = result.container.querySelector(`#\\$log1 .${styles.lifeLogTree.timeRange}`);
      expect(timeRangeDiv?.textContent).toMatch(/\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}/);
    });

    result.unmount();
  });

  test("it can set current time on endAt with F key", async (ctx) => {
    const { result, ready, getFirestoreRef, getUpdateStateRef } = setupLifeLogsTest(ctx.task.id);

    await waitFor(() => {
      expect(ready()).toBe(true);
    });

    await result.findByText("first lifelog", {}, { timeout: 5000 });

    // Select the lifelog
    getUpdateStateRef()((state) => {
      state.panesLifeLogs.selectedLifeLogId = "$log1";
      state.panesLifeLogs.selectedLifeLogNodeId = "";
    });

    // The lifelog already has endAt = noneTimestamp, so "F" key should work
    // Press "F" to set current time on endAt
    const beforeTime = Date.now();
    fireEvent.keyDown(document, { code: "KeyF", key: "f" });

    // Verify endAt was set to approximately current time in DB
    const lifeLogsCol = getCollection(getFirestoreRef(), "lifeLogs");
    await waitFor(async () => {
      const log1Doc = await getDoc(doc(lifeLogsCol, "$log1"));
      const endAt = log1Doc.data()?.endAt as Timestamp;
      const endAtMillis = endAt.toMillis();
      // The endAt should be close to the current time (within a few seconds)
      expect(endAtMillis).toBeGreaterThanOrEqual(Math.floor(beforeTime / 1000) * 1000 - 1000);
      expect(endAtMillis).toBeLessThanOrEqual(Date.now() + 1000);
    });

    // Verify DOM was updated - N/A count for $log1 should decrease
    // $log1 had endAt=N/A, after F key it should show a time
    await waitFor(() => {
      // Find the endAt element in $log1's time range (it's the second time value after the "-")
      const log1TimeRange = result.container.querySelector(`#\\$log1 .${styles.lifeLogTree.timeRange}`);
      // The whole time range should now have two time values (no N/A for this log's endAt)
      const textContent = log1TimeRange?.textContent ?? "";
      // Count occurrences of date-time pattern
      const timeMatches = textContent.match(/\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}/g);
      expect(timeMatches?.length).toBe(2); // Both startAt and endAt should show times
    });

    result.unmount();
  });

  test("it can edit lifeLogTree node text", async (ctx) => {
    const { result, ready, getFirestoreRef, getUpdateStateRef } = setupLifeLogsTest(ctx.task.id);

    await waitFor(() => {
      expect(ready()).toBe(true);
    });

    await result.findByText("first lifelog", {}, { timeout: 5000 });

    // Focus on the tree by selecting a tree node
    getUpdateStateRef()((state) => {
      state.panesLifeLogs.selectedLifeLogNodeId = "child1";
    });

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

    // Verify the text was saved in DB
    const lifeLogTreeNodesCol = getCollection(getFirestoreRef(), "lifeLogTreeNodes");
    await waitFor(async () => {
      const child1Doc = await getDoc(doc(lifeLogTreeNodesCol, "child1"));
      expect(child1Doc.data()?.text).toBe("edited child text");
    });

    // Verify the DOM was updated
    await waitFor(() => {
      expect(result.getByText("edited child text")).toBeTruthy();
    });
    expect(result.queryByText("first child")).toBeNull();

    result.unmount();
  });
});
