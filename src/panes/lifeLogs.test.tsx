import { fireEvent, render, waitFor } from "@solidjs/testing-library";
import { doc, getDoc as getDocFirestore, getDocs, Timestamp, writeBatch } from "firebase/firestore";
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
    let child2Doc = await getDocFirestore(doc(lifeLogTreeNodes, "child2"));
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
      child2Doc = await getDocFirestore(doc(lifeLogTreeNodes, "child2"));
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
      child2Doc = await getDocFirestore(doc(lifeLogTreeNodes, "child2"));
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
});
