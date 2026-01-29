import { render } from "@solidjs/testing-library";
import { doc, Timestamp, writeBatch } from "firebase/firestore";
import { onMount, Show, Suspense } from "solid-js";

import { analyzeTextForNgrams } from "@/ngram";
import "@/panes/lifeLogs/store";
import { Search } from "@/panes/search";
import { ActionsServiceProvider } from "@/services/actions";
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

export interface SetupSearchTestOptions {
  initialQuery?: string;
  isActive?: boolean;
}

export async function setupSearchTest(testId: string, db: DatabaseInfo, options?: SetupSearchTestOptions) {
  let resolveReady: () => void;
  let rejectReady: (error: unknown) => void;
  const ready = new Promise<void>((resolve, reject) => {
    resolveReady = resolve;
    rejectReady = reject;
  });

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
                const batchVersion = getCollection(firestore, "batchVersion");
                const lifeLogs = getCollection(firestore, "lifeLogs");
                const lifeLogTreeNodes = getCollection(firestore, "lifeLogTreeNodes");
                const ngrams = getCollection(firestore, "ngrams");
                const { updateState } = useStoreService();

                const { state } = useStoreService();

                onMount(() => {
                  (async () => {
                    const batch = writeBatch(firestore.firestore);

                    batch.set(doc(batchVersion, singletonDocumentId), {
                      version: "__INITIAL__",
                      prevVersion: "",
                      createdAt: Timestamp.fromDate(baseTime),
                      updatedAt: Timestamp.fromDate(baseTime),
                    });

                    // Create test lifeLogs
                    const startTime1 = new Date(baseTime);
                    startTime1.setHours(10, 30, 0, 0);

                    batch.set(doc(lifeLogs, "$log1"), {
                      text: "first lifelog searchable",
                      hasTreeNodes: true,
                      startAt: Timestamp.fromDate(startTime1),
                      endAt: noneTimestamp,
                      createdAt: Timestamp.fromDate(baseTime),
                      updatedAt: Timestamp.fromDate(baseTime),
                    });

                    // Create ngram for $log1
                    const log1Analysis = analyzeTextForNgrams("first lifelog searchable");
                    batch.set(doc(ngrams, "$log1lifeLogs"), {
                      collection: "lifeLogs",
                      text: "first lifelog searchable",
                      normalizedText: log1Analysis.normalizedText,
                      ngramMap: log1Analysis.ngramMap,
                    });

                    const startTime2 = new Date(baseTime);
                    startTime2.setHours(12, 0, 0, 0);

                    batch.set(doc(lifeLogs, "$log2"), {
                      text: "second lifelog different",
                      hasTreeNodes: false,
                      startAt: Timestamp.fromDate(startTime2),
                      endAt: noneTimestamp,
                      createdAt: Timestamp.fromDate(baseTime),
                      updatedAt: Timestamp.fromDate(baseTime),
                    });

                    // Create ngram for $log2
                    const log2Analysis = analyzeTextForNgrams("second lifelog different");
                    batch.set(doc(ngrams, "$log2lifeLogs"), {
                      collection: "lifeLogs",
                      text: "second lifelog different",
                      normalizedText: log2Analysis.normalizedText,
                      ngramMap: log2Analysis.ngramMap,
                    });

                    // Create tree node
                    batch.set(doc(lifeLogTreeNodes, "child1"), {
                      text: "tree node searchable",
                      lifeLogId: "$log1",
                      parentId: "$log1",
                      order: "a0",
                      createdAt: Timestamp.fromDate(baseTime),
                      updatedAt: Timestamp.fromDate(baseTime),
                    });

                    // Create ngram for child1
                    const child1Analysis = analyzeTextForNgrams("tree node searchable");
                    batch.set(doc(ngrams, "child1lifeLogTreeNodes"), {
                      collection: "lifeLogTreeNodes",
                      text: "tree node searchable",
                      normalizedText: child1Analysis.normalizedText,
                      ngramMap: child1Analysis.ngramMap,
                    });

                    // Create another tree node
                    batch.set(doc(lifeLogTreeNodes, "child2"), {
                      text: "another node different",
                      lifeLogId: "$log1",
                      parentId: "$log1",
                      order: "a1",
                      createdAt: Timestamp.fromDate(baseTime),
                      updatedAt: Timestamp.fromDate(baseTime),
                    });

                    // Create ngram for child2
                    const child2Analysis = analyzeTextForNgrams("another node different");
                    batch.set(doc(ngrams, "child2lifeLogTreeNodes"), {
                      collection: "lifeLogTreeNodes",
                      text: "another node different",
                      normalizedText: child2Analysis.normalizedText,
                      ngramMap: child2Analysis.ngramMap,
                    });

                    await batch.commit();

                    // Set initial state
                    updateState((s) => {
                      s.panesLifeLogs.selectedLifeLogId = "$log1";
                      s.panesSearch.isActive = options?.isActive ?? true;
                      s.panesSearch.query = options?.initialQuery ?? "";
                      s.panesSearch.selectedResultIndex = 0;
                    });
                  })().then(resolveReady, rejectReady);
                });

                return (
                  <Show when={state.panesSearch.isActive}>
                    <Search />
                  </Show>
                );
              })()}
            </Suspense>
          </ActionsServiceProvider>
        </FirestoreServiceProvider>
      </FirebaseServiceProvider>
    </StoreServiceProvider>
  ));

  await ready;

  return {
    result,
  };
}
