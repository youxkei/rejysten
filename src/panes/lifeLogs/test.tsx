import { render } from "@solidjs/testing-library";
import { doc, Timestamp, writeBatch } from "firebase/firestore";
import { onMount, Suspense } from "solid-js";

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

export const baseTime = new Date(2026, 0, 10, 12, 0, 0, 0);

export interface DatabaseInfo {
  emulatorPort: number;
}

export interface SetupLifeLogsTestOptions {
  lifeLogCount?: number;
  treeNodeCount?: number;
}

export async function setupLifeLogsTest(testId: string, db: DatabaseInfo, options?: SetupLifeLogsTestOptions) {
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
        setErrors={() => undefined}
        appName={testId}
      >
        <FirestoreServiceProvider emulatorPort={db.emulatorPort} useMemoryCache>
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

                  // Generate additional tree nodes for scroll testing
                  const treeNodeCount = options?.treeNodeCount ?? 0;
                  for (let i = 0; i < treeNodeCount; i++) {
                    batch.set(doc(lifeLogTreeNodes, `scrollTestNode${i}`), {
                      text: `scroll test node ${i}`,
                      parentId: "$log1",
                      order: `b${String(i).padStart(3, "0")}`,
                      createdAt: Timestamp.fromDate(baseTime),
                      updatedAt: Timestamp.fromDate(baseTime),
                    });
                  }

                  // Third lifelog - with noneTimestamp startAt for S key test
                  batch.set(doc(lifeLogs, "$log3"), {
                    text: "third lifelog",
                    startAt: noneTimestamp,
                    endAt: noneTimestamp,
                    createdAt: Timestamp.fromDate(baseTime),
                    updatedAt: Timestamp.fromDate(baseTime),
                  });

                  // Generate additional LifeLogs for scroll testing
                  const lifeLogCount = options?.lifeLogCount ?? 3;
                  for (let i = 4; i <= lifeLogCount; i++) {
                    const startTime = new Date(baseTime);
                    // Use minutes to avoid exceeding 24 hours
                    startTime.setHours(12, i, 0, 0);

                    batch.set(doc(lifeLogs, `$log${i}`), {
                      text: `lifelog ${i}`,
                      startAt: Timestamp.fromDate(startTime),
                      endAt: noneTimestamp,
                      createdAt: Timestamp.fromDate(baseTime),
                      updatedAt: Timestamp.fromDate(baseTime),
                    });
                  }

                  await batch.commit();

                  // Select the first LifeLog that exists in the query results
                  // When lifeLogCount > 3, earlier LifeLogs might be filtered out by the time-based query
                  const initialSelectedId = lifeLogCount > 3 ? `$log${Math.min(lifeLogCount, 10)}` : "$log1";
                  updateState((state) => {
                    state.panesLifeLogs.selectedLifeLogId = initialSelectedId;
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

  await result.findByText("first lifelog");

  return {
    result,
  };
}
