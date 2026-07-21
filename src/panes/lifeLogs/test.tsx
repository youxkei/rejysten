import { render, waitFor } from "@solidjs/testing-library";
import { doc, Timestamp, writeBatch } from "firebase/firestore";
import { createSignal, onMount, Show, Suspense } from "solid-js";

import { WithEditHistoryPanel } from "@/components/editHistory";
import { analyzeTextForNgrams } from "@/ngram";
import { LifeLogs } from "@/panes/lifeLogs";
import "@/panes/search/actions";
import "@/panes/search/store";
import "@/panes/store";
import { ActionsServiceProvider } from "@/services/actions";
import { FirebaseServiceProvider } from "@/services/firebase";
import {
  type FirestoreService,
  FirestoreServiceProvider,
  getCollection,
  singletonDocumentId,
  useFirestoreService,
} from "@/services/firebase/firestore";
import { StoreServiceProvider, useStoreService } from "@/services/store";
import { Toast } from "@/services/toast";
import { type DatabaseInfo } from "@/test";
import { dayMs, noneTimestamp } from "@/timestamp";
import { LifeLogsProps } from "@/panes/lifeLogs/index";

export const baseTime = new Date(2026, 0, 10, 12, 0, 0, 0);

export interface SetupLifeLogsTestOptions {
  lifeLogCount?: number;
  treeNodeCount?: number;
  lifeLogsProps?: LifeLogsProps;
  outOfRangeLifeLogs?: Array<{
    id: string;
    text: string;
    daysAgo: number;
    endDaysAgo?: number;
  }>;
  initialSelectedId?: string;
  skipDefaultLifeLogs?: boolean;
  includeLifeLogWithDuration?: boolean;
  withEditHistory?: boolean;
  withToast?: boolean;
  // Past lifeLog texts to seed into the ngram corpus so text-completion has candidates.
  // Seeded with recent (baseTime) uuidv7 ids so they fall inside the completion window.
  // Only ngram docs are created (no visible lifeLogs), so the pane contents stay unchanged.
  completionCandidates?: string[];
  // Like completionCandidates but seeded with a uuidv7 id older than the completion window,
  // so they must NOT be suggested.
  completionStaleCandidates?: string[];
  // Seed an in-range lifeLog with a recent uuidv7-form id plus its own ngram doc, and
  // auto-select it. Used to verify the edited lifeLog's own past text is never suggested:
  // with a recent uuidv7 id its ngram doc survives the age cutoff, so only the id-based
  // self-exclusion keeps it out of the dropdown.
  completionSelfLifeLog?: { text: string };
  // Tree-node texts seeded into the ngram corpus (collection: "lifeLogTreeNodes"). Used to
  // verify completion suggests lifeLog texts only and excludes tree-node texts.
  completionTreeNodeCandidates?: string[];
}

// Build a uuidv7-shaped id whose embedded timestamp is `ms`, unique per `uniq`. Completion
// relies on lifeLog ids being uuidv7 (creation time in the first 48 bits) to order by
// recency and apply an age cutoff, so seeded ngram doc ids must have the same shape.
function uuidV7FormFromMs(ms: number, uniq: number): string {
  const hex = Math.floor(ms).toString(16).padStart(12, "0");
  const u = (uniq & 0xfff).toString(16).padStart(3, "0");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-7${u}-8000-000000000000`;
}

export async function setupLifeLogsTest(testId: string, db: DatabaseInfo, options?: SetupLifeLogsTestOptions) {
  window.localStorage.removeItem(`rejysten.service.store.state${testId}`);

  let resolveReady: () => void;
  let rejectReady: (error: unknown) => void;
  const ready = new Promise<void>((resolve, reject) => {
    resolveReady = resolve;
    rejectReady = reject;
  });

  let firestoreRef: FirestoreService | undefined;

  const result = render(() => (
    <StoreServiceProvider localStorageNamePostfix={testId}>
      <FirebaseServiceProvider
        configYAML={`{ apiKey: "apiKey", authDomain: "authDomain", projectId: "demo", storageBucket: "", messagingSenderId: "", appId: "", measurementId: "", projectNumber: "", version: "2" }`}
        setErrors={() => undefined}
        appName={testId}
      >
        <FirestoreServiceProvider emulatorPort={db.emulatorPort} useMemoryCache>
          <ActionsServiceProvider>
            <Suspense fallback={<span>loading....</span>}>
              {(() => {
                const firestore = useFirestoreService();
                firestoreRef = firestore;
                const batchVersion = getCollection(firestore, "batchVersion");
                const lifeLogs = getCollection(firestore, "lifeLogs");
                const lifeLogTreeNodes = getCollection(firestore, "lifeLogTreeNodes");
                const ngrams = getCollection(firestore, "ngrams");
                const { updateState } = useStoreService();
                const [dataReady$, setDataReady] = createSignal(false);

                onMount(() => {
                  (async () => {
                    const batch = writeBatch(firestore.firestore);

                    batch.set(doc(batchVersion, singletonDocumentId), {
                      version: "__INITIAL__",
                      prevVersion: "",
                      createdAt: Timestamp.fromDate(baseTime),
                      updatedAt: Timestamp.fromDate(baseTime),
                    });

                    if (!options?.skipDefaultLifeLogs) {
                      // First lifelog - with specific time
                      const startTime1 = new Date(baseTime);
                      startTime1.setHours(10, 30, 0, 0);

                      batch.set(doc(lifeLogs, "$log1"), {
                        text: "first lifelog",
                        hasTreeNodes: true,
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
                        hasTreeNodes: false,
                        startAt: Timestamp.fromDate(startTime2),
                        endAt: noneTimestamp,
                        createdAt: Timestamp.fromDate(baseTime),
                        updatedAt: Timestamp.fromDate(baseTime),
                      });

                      // Create three sibling tree nodes under $log1
                      // child1 (has children), child2 (no children), child3 (has children)
                      batch.set(doc(lifeLogTreeNodes, "child1"), {
                        text: "first child",
                        lifeLogId: "$log1",
                        parentId: "$log1",
                        order: "a0",
                        createdAt: Timestamp.fromDate(baseTime),
                        updatedAt: Timestamp.fromDate(baseTime),
                      });

                      batch.set(doc(lifeLogTreeNodes, "child2"), {
                        text: "second child",
                        lifeLogId: "$log1",
                        parentId: "$log1",
                        order: "a1",
                        createdAt: Timestamp.fromDate(baseTime),
                        updatedAt: Timestamp.fromDate(baseTime),
                      });

                      batch.set(doc(lifeLogTreeNodes, "child3"), {
                        text: "third child",
                        lifeLogId: "$log1",
                        parentId: "$log1",
                        order: "a2",
                        createdAt: Timestamp.fromDate(baseTime),
                        updatedAt: Timestamp.fromDate(baseTime),
                      });

                      // Create a grandchild node under child1 for deep navigation tests
                      batch.set(doc(lifeLogTreeNodes, "grandchild1"), {
                        text: "grandchild",
                        lifeLogId: "$log1",
                        parentId: "child1",
                        order: "a0",
                        createdAt: Timestamp.fromDate(baseTime),
                        updatedAt: Timestamp.fromDate(baseTime),
                      });

                      // Create a great-grandchild node under grandchild1 for deeper navigation tests
                      batch.set(doc(lifeLogTreeNodes, "greatGrandchild1"), {
                        text: "great-grandchild",
                        lifeLogId: "$log1",
                        parentId: "grandchild1",
                        order: "a0",
                        createdAt: Timestamp.fromDate(baseTime),
                        updatedAt: Timestamp.fromDate(baseTime),
                      });

                      // Create a grandchild node under child3 to give child3 children
                      // This enables testing "Delete when next node has children"
                      batch.set(doc(lifeLogTreeNodes, "grandchild3"), {
                        text: "third grandchild",
                        lifeLogId: "$log1",
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
                          lifeLogId: "$log1",
                          parentId: "$log1",
                          order: `b${String(i).padStart(3, "0")}`,
                          createdAt: Timestamp.fromDate(baseTime),
                          updatedAt: Timestamp.fromDate(baseTime),
                        });
                      }

                      // Third lifelog - with noneTimestamp startAt for S key test
                      batch.set(doc(lifeLogs, "$log3"), {
                        text: "third lifelog",
                        hasTreeNodes: false,
                        startAt: noneTimestamp,
                        endAt: noneTimestamp,
                        createdAt: Timestamp.fromDate(baseTime),
                        updatedAt: Timestamp.fromDate(baseTime),
                      });

                      // Fourth lifelog - deletable LifeLog after $log3 for Delete key test
                      // Sorts after $log3 because "$log4" > "$log3" and both have startAt=none
                      batch.set(doc(lifeLogs, "$log4"), {
                        text: "fourth lifelog",
                        hasTreeNodes: false,
                        startAt: noneTimestamp,
                        endAt: noneTimestamp,
                        createdAt: Timestamp.fromDate(baseTime),
                        updatedAt: Timestamp.fromDate(baseTime),
                      });

                      // LifeLog with both startAt and endAt for duration display test (optional)
                      if (options?.includeLifeLogWithDuration) {
                        const startTimeDuration = new Date(baseTime);
                        startTimeDuration.setHours(9, 0, 0, 0);
                        const endTimeDuration = new Date(baseTime);
                        endTimeDuration.setHours(9, 30, 45, 0);

                        batch.set(doc(lifeLogs, "$logDuration"), {
                          text: "log with duration",
                          hasTreeNodes: false,
                          startAt: Timestamp.fromDate(startTimeDuration),
                          endAt: Timestamp.fromDate(endTimeDuration),
                          createdAt: Timestamp.fromDate(baseTime),
                          updatedAt: Timestamp.fromDate(baseTime),
                        });
                      }

                      // Generate additional LifeLogs for scroll testing
                      const lifeLogCount = options?.lifeLogCount ?? 4;
                      for (let i = 5; i <= lifeLogCount; i++) {
                        const startTime = new Date(baseTime);
                        // Use minutes to avoid exceeding 24 hours
                        startTime.setHours(12, i, 0, 0);

                        batch.set(doc(lifeLogs, `$log${i}`), {
                          text: `lifelog ${i}`,
                          hasTreeNodes: false,
                          startAt: Timestamp.fromDate(startTime),
                          endAt: noneTimestamp,
                          createdAt: Timestamp.fromDate(baseTime),
                          updatedAt: Timestamp.fromDate(baseTime),
                        });
                      }
                    }

                    // Generate out-of-range LifeLogs for scroll window testing
                    const outOfRangeLifeLogs = options?.outOfRangeLifeLogs ?? [];
                    for (const outOfRange of outOfRangeLifeLogs) {
                      const startTime = new Date(baseTime.getTime() - outOfRange.daysAgo * dayMs);
                      const endTime =
                        outOfRange.endDaysAgo !== undefined
                          ? Timestamp.fromDate(new Date(baseTime.getTime() - outOfRange.endDaysAgo * dayMs))
                          : noneTimestamp;
                      batch.set(doc(lifeLogs, outOfRange.id), {
                        text: outOfRange.text,
                        hasTreeNodes: false,
                        startAt: Timestamp.fromDate(startTime),
                        endAt: endTime,
                        createdAt: Timestamp.fromDate(baseTime),
                        updatedAt: Timestamp.fromDate(baseTime),
                      });
                    }

                    // Seed ngram docs for text-completion candidates (no visible lifeLogs).
                    // Recent candidates get baseTime ids; stale ones get an id well before
                    // the completion window so the age cutoff must drop them.
                    const recentMs = baseTime.getTime();
                    const staleDate = new Date(baseTime);
                    staleDate.setMonth(staleDate.getMonth() - 4);
                    const staleMs = staleDate.getTime();

                    let ngramUniq = 0;
                    const seedNgram = (id: string, collection: string, text: string) => {
                      const analysis = analyzeTextForNgrams(text);
                      batch.set(doc(ngrams, id), {
                        collection,
                        text,
                        normalizedText: analysis.normalizedText,
                        ngramMap: analysis.ngramMap,
                      });
                    };

                    const completionCandidates = options?.completionCandidates ?? [];
                    completionCandidates.forEach((text) => {
                      seedNgram(`${uuidV7FormFromMs(recentMs, ngramUniq++)}lifeLogs`, "lifeLogs", text);
                    });

                    // In-range lifeLog with a recent uuidv7-form id and its own ngram doc
                    // (auto-selected below) for self-exclusion tests. recentMs + 1 keeps the
                    // id distinct from every candidate id above.
                    const selfLifeLogId = uuidV7FormFromMs(recentMs + 1, 0);
                    if (options?.completionSelfLifeLog) {
                      batch.set(doc(lifeLogs, selfLifeLogId), {
                        text: options.completionSelfLifeLog.text,
                        hasTreeNodes: false,
                        startAt: Timestamp.fromDate(baseTime),
                        endAt: noneTimestamp,
                        createdAt: Timestamp.fromDate(baseTime),
                        updatedAt: Timestamp.fromDate(baseTime),
                      });
                      seedNgram(`${selfLifeLogId}lifeLogs`, "lifeLogs", options.completionSelfLifeLog.text);
                    }

                    const completionStaleCandidates = options?.completionStaleCandidates ?? [];
                    completionStaleCandidates.forEach((text) => {
                      seedNgram(`${uuidV7FormFromMs(staleMs, ngramUniq++)}lifeLogs`, "lifeLogs", text);
                    });

                    // Seed tree-node ngram docs (must NOT appear as completion candidates).
                    const completionTreeNodeCandidates = options?.completionTreeNodeCandidates ?? [];
                    completionTreeNodeCandidates.forEach((text) => {
                      seedNgram(`${uuidV7FormFromMs(recentMs, ngramUniq++)}lifeLogTreeNodes`, "lifeLogTreeNodes", text);
                    });

                    await batch.commit();

                    // Mount <LifeLogs> only after batch.commit() so onSnapshot
                    // subscribes to a query whose data is already server-confirmed.
                    // Subscribing before the batch commits produces stale server-state
                    // snapshots that miss some of the batch docs (flaky tests).
                    setDataReady(true);

                    // Select the first LifeLog that exists in the query results
                    // When lifeLogCount > 3, earlier LifeLogs might be filtered out by the time-based query
                    if (options?.completionSelfLifeLog) {
                      updateState((state) => {
                        state.panesLifeLogs.selectedLifeLogId = selfLifeLogId;
                      });
                    } else if (options?.initialSelectedId) {
                      updateState((state) => {
                        state.panesLifeLogs.selectedLifeLogId = options.initialSelectedId!;
                      });
                    } else if (!options?.skipDefaultLifeLogs) {
                      const lifeLogCount = options?.lifeLogCount ?? 3;
                      const initialSelectedId = lifeLogCount > 3 ? `$log${Math.min(lifeLogCount, 10)}` : "$log1";
                      updateState((state) => {
                        state.panesLifeLogs.selectedLifeLogId = initialSelectedId;
                      });
                    }
                  })().then(resolveReady, rejectReady);
                });

                const content = (
                  <Show when={dataReady$()} fallback={<span>setup loading...</span>}>
                    <LifeLogs {...(options?.lifeLogsProps ?? {})} />
                  </Show>
                );
                const contentWithToast = options?.withToast ? (
                  <>
                    {content}
                    <Toast />
                  </>
                ) : (
                  content
                );
                return options?.withEditHistory ? (
                  <WithEditHistoryPanel>{contentWithToast}</WithEditHistoryPanel>
                ) : (
                  contentWithToast
                );
              })()}
            </Suspense>
          </ActionsServiceProvider>
        </FirestoreServiceProvider>
      </FirebaseServiceProvider>
    </StoreServiceProvider>
  ));

  await ready;

  // Wait for initial render - skip if we're testing with out-of-range LifeLogs that might slide the window
  if (!options?.outOfRangeLifeLogs?.length && !options?.skipDefaultLifeLogs) {
    await result.findByText("first lifelog");
  }
  await waitFor(() => {
    if (firestoreRef?.batchVersion$()?.version !== "__INITIAL__") {
      throw new Error("batchVersion$ is not ready");
    }
  });

  return {
    result,
    firestore: firestoreRef!,
  };
}
