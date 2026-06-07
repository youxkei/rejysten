import { cleanup, render, waitFor } from "@solidjs/testing-library";
import { doc, Timestamp, writeBatch } from "firebase/firestore";
import { createSignal, onMount, Show, Suspense } from "solid-js";
import { afterAll, afterEach, beforeAll, describe, expect, vi } from "vitest";
import { userEvent } from "vitest/browser";

import { awaitPendingCallbacks } from "@/awaitableCallback";
import { handleShare, WithShare } from "@/components/share";
import { analyzeTextForNgrams } from "@/ngram";
import { fetchOGPMeta, resolveUrl } from "@/ogp";
import { baseTime } from "@/panes/lifeLogs/test";
import { FirebaseServiceProvider } from "@/services/firebase";
import {
  FirestoreServiceProvider,
  getCollection,
  getDocs,
  singletonDocumentId,
  useFirestoreService,
} from "@/services/firebase/firestore";
import "@/panes/lifeLogs/schema";
import "@/panes/lifeLogs/store";
import { runBatch, waitForPendingCommitsForTest } from "@/services/firebase/firestore/batch";
import { encodeNgramMapForFirestore } from "@/services/firebase/firestore/ngram";
import { query, where } from "@/services/firebase/firestore/query";
import { StoreServiceProvider, useStoreService } from "@/services/store";
import { acquireEmulator, createTestWithDb, releaseEmulator, type DatabaseInfo } from "@/test";
import { noneTimestamp } from "@/timestamp";

vi.mock(import("@/date"), async () => {
  return {
    NewDate: () => baseTime,
    DateNow: () => baseTime.getTime(),
    TimestampNow: () => Timestamp.fromDate(baseTime),
  };
});

vi.mock(import("@/ogp"), async () => {
  return {
    fetchOGPMeta: vi.fn().mockResolvedValue({ title: null, description: null }),
    resolveUrl: vi.fn().mockResolvedValue(null),
  };
});

let emulatorPort: number;
const it = createTestWithDb(() => emulatorPort);

beforeAll(async () => {
  emulatorPort = await acquireEmulator();
});

afterAll(async () => {
  await releaseEmulator(emulatorPort);
});

let firestoreForCleanup: ReturnType<typeof useFirestoreService> | undefined;

async function waitForCurrentPendingCommits() {
  if (firestoreForCleanup) {
    await waitForPendingCommitsForTest({ service: firestoreForCleanup });
  }
}

afterEach(async () => {
  await awaitPendingCallbacks();
  await waitForCurrentPendingCommits();
  cleanup();
  await awaitPendingCallbacks();
  await waitForCurrentPendingCommits();
  firestoreForCleanup = undefined;
  history.replaceState(null, "", "/");
});

function setupShareTest(
  testId: string,
  db: DatabaseInfo,
  setupData: (firestore: ReturnType<typeof useFirestoreService>) => Promise<void>,
) {
  let resolveReady: () => void;
  let rejectReady: (error: unknown) => void;
  const ready = new Promise<void>((resolve, reject) => {
    resolveReady = resolve;
    rejectReady = reject;
  });

  let firestoreRef: ReturnType<typeof useFirestoreService>;
  let storeRef: ReturnType<typeof useStoreService>;
  let shareResult: Awaited<ReturnType<typeof handleShare>> | undefined;

  const result = render(() => (
    <StoreServiceProvider localStorageNamePostfix={testId}>
      <FirebaseServiceProvider
        configYAML={`{ apiKey: "apiKey", authDomain: "authDomain", projectId: "demo", storageBucket: "", messagingSenderId: "", appId: "", measurementId: "", projectNumber: "", version: "2" }`}
        setErrors={() => undefined}
        appName={testId}
      >
        <FirestoreServiceProvider emulatorPort={db.emulatorPort} useMemoryCache>
          <Suspense fallback={<span>loading...</span>}>
            {(() => {
              const firestore = useFirestoreService();
              firestoreRef = firestore;
              firestoreForCleanup = firestore;
              storeRef = useStoreService();

              onMount(() => {
                (async () => {
                  await setupData(firestore);
                  const result = await handleShare(firestore);
                  shareResult = result;
                  if (result && result.status !== "needsConfirmation") {
                    storeRef.updateState((state) => {
                      state.panesLifeLogs.selectedLifeLogId = result.lifeLogId;
                      state.panesLifeLogs.selectedLifeLogNodeId = result.nodeId;
                    });
                  }
                  history.replaceState(null, "", "/");
                })().then(resolveReady, rejectReady);
              });

              return <span>share-handler-mounted</span>;
            })()}
          </Suspense>
        </FirestoreServiceProvider>
      </FirebaseServiceProvider>
    </StoreServiceProvider>
  ));

  return {
    ready,
    result,
    getFirestore: () => firestoreRef,
    getStore: () => storeRef,
    getShareResult: () => shareResult,
  };
}

function setupShareComponentTest(
  testId: string,
  db: DatabaseInfo,
  setupData: (firestore: ReturnType<typeof useFirestoreService>) => Promise<void>,
) {
  let resolveReady: () => void;
  let rejectReady: (error: unknown) => void;
  const ready = new Promise<void>((resolve, reject) => {
    resolveReady = resolve;
    rejectReady = reject;
  });

  let firestoreRef: ReturnType<typeof useFirestoreService>;
  let storeRef: ReturnType<typeof useStoreService>;

  const result = render(() => (
    <StoreServiceProvider localStorageNamePostfix={testId}>
      <FirebaseServiceProvider
        configYAML={`{ apiKey: "apiKey", authDomain: "authDomain", projectId: "demo", storageBucket: "", messagingSenderId: "", appId: "", measurementId: "", projectNumber: "", version: "2" }`}
        setErrors={() => undefined}
        appName={testId}
      >
        <FirestoreServiceProvider emulatorPort={db.emulatorPort} useMemoryCache>
          <Suspense fallback={<span>loading...</span>}>
            {(() => {
              const firestore = useFirestoreService();
              firestoreRef = firestore;
              firestoreForCleanup = firestore;
              storeRef = useStoreService();
              const [isReady, setIsReady] = createSignal(false);

              onMount(() => {
                setupData(firestore)
                  .then(() => {
                    setIsReady(true);
                    resolveReady();
                  })
                  .catch(rejectReady);
              });

              return (
                <Show when={isReady()} fallback={<span>preparing...</span>}>
                  <WithShare>
                    <span>app-content</span>
                  </WithShare>
                </Show>
              );
            })()}
          </Suspense>
        </FirestoreServiceProvider>
      </FirebaseServiceProvider>
    </StoreServiceProvider>
  ));

  return {
    ready,
    result,
    getFirestore: () => firestoreRef,
    getStore: () => storeRef,
  };
}

function setNgramDoc(
  batch: ReturnType<typeof writeBatch>,
  firestore: ReturnType<typeof useFirestoreService>,
  id: string,
  collection: "lifeLogTreeNodes" | "lifeLogs",
  text: string,
) {
  const ngrams = getCollection(firestore, "ngrams");
  const { normalizedText, ngramMap } = analyzeTextForNgrams(text);
  batch.set(doc(ngrams, `${id}${collection}`), {
    collection,
    text,
    normalizedText,
    ngramMap: encodeNgramMapForFirestore(ngramMap),
  });
}

describe("share", () => {
  it("adds link to existing running ネットサーフィン with tree nodes", async ({ db, task }) => {
    history.replaceState(null, "", "/?title=Example&url=https://example.com");

    const { ready, getFirestore, getStore } = setupShareTest(task.id, db, async (firestore) => {
      const batch = writeBatch(firestore.firestore);
      const batchVersion = getCollection(firestore, "batchVersion");
      const lifeLogs = getCollection(firestore, "lifeLogs");
      const lifeLogTreeNodes = getCollection(firestore, "lifeLogTreeNodes");

      batch.set(doc(batchVersion, singletonDocumentId), {
        version: "__INITIAL__",
        prevVersion: "",
        createdAt: Timestamp.fromDate(baseTime),
        updatedAt: Timestamp.fromDate(baseTime),
      });

      batch.set(doc(lifeLogs, "$netsurf1"), {
        text: "ネットサーフィン",
        hasTreeNodes: true,
        startAt: Timestamp.fromDate(baseTime),
        endAt: noneTimestamp,
        createdAt: Timestamp.fromDate(baseTime),
        updatedAt: Timestamp.fromDate(baseTime),
      });

      batch.set(doc(lifeLogTreeNodes, "$node1"), {
        text: "existing node",
        lifeLogId: "$netsurf1",
        parentId: "$netsurf1",
        order: "a0",
        createdAt: Timestamp.fromDate(baseTime),
        updatedAt: Timestamp.fromDate(baseTime),
      });

      await batch.commit();
    });

    await ready;
    await awaitPendingCallbacks();

    await waitFor(() => {
      expect(window.location.search).toBe("");
    });

    const firestore = getFirestore();
    const treeNodesCol = getCollection(firestore, "lifeLogTreeNodes");
    const nodes = await getDocs(firestore, query(treeNodesCol, where("parentId", "==", "$netsurf1")), {
      fromServer: true,
    });

    expect(nodes).toHaveLength(2);
    const newNode = nodes.find((n) => n.text === "[Example](https://example.com)");
    expect(newNode).toBeTruthy();
    expect(newNode!.order > "a0").toBe(true);

    const store = getStore();
    expect(store.state.panesLifeLogs.selectedLifeLogId).toBe("$netsurf1");
    expect(store.state.panesLifeLogs.selectedLifeLogNodeId).toBe(newNode!.id);
  });

  it("imports share while a pending local LifeLog overlay exists", async ({ db, task }) => {
    history.replaceState(null, "", "/?title=Example&url=https://example.com/pending-overlay");

    const { ready, getFirestore, getStore } = setupShareTest(task.id, db, async (firestore) => {
      const batch = writeBatch(firestore.firestore);
      const batchVersion = getCollection(firestore, "batchVersion");
      const lifeLogs = getCollection(firestore, "lifeLogs");
      const lifeLogTreeNodes = getCollection(firestore, "lifeLogTreeNodes");

      batch.set(doc(batchVersion, singletonDocumentId), {
        version: "__INITIAL__",
        prevVersion: "",
        createdAt: Timestamp.fromDate(baseTime),
        updatedAt: Timestamp.fromDate(baseTime),
      });
      batch.set(doc(lifeLogs, "$netsurf-pending"), {
        text: "ネットサーフィン",
        hasTreeNodes: true,
        startAt: Timestamp.fromDate(baseTime),
        endAt: noneTimestamp,
        createdAt: Timestamp.fromDate(baseTime),
        updatedAt: Timestamp.fromDate(baseTime),
      });
      batch.set(doc(lifeLogTreeNodes, "$node-pending"), {
        text: "existing node",
        lifeLogId: "$netsurf-pending",
        parentId: "$netsurf-pending",
        order: "a0",
        createdAt: Timestamp.fromDate(baseTime),
        updatedAt: Timestamp.fromDate(baseTime),
      });
      await batch.commit();

      await runBatch(
        firestore,
        (localBatch) => {
          localBatch.set(lifeLogs, {
            id: "$pending-local",
            text: "local pending",
            hasTreeNodes: false,
            startAt: Timestamp.fromDate(baseTime),
            endAt: noneTimestamp,
          });
          return Promise.resolve();
        },
        { skipHistory: true },
      );
    });

    await ready;
    await awaitPendingCallbacks();
    await waitForPendingCommitsForTest({ service: getFirestore() });

    const firestore = getFirestore();
    const treeNodesCol = getCollection(firestore, "lifeLogTreeNodes");
    const nodes = await getDocs(firestore, query(treeNodesCol, where("parentId", "==", "$netsurf-pending")), {
      fromServer: true,
    });
    const importedNode = nodes.find((n) => n.text === "[Example](https://example.com/pending-overlay)");

    expect(importedNode).toBeTruthy();
    expect(nodes.map((n) => n.text)).toContain("existing node");
    const store = getStore();
    expect(store.state.panesLifeLogs.selectedLifeLogId).toBe("$netsurf-pending");
    expect(store.state.panesLifeLogs.selectedLifeLogNodeId).toBe(importedNode!.id);
  });

  it("adds link to existing running ネットサーフィン without tree nodes", async ({ db, task }) => {
    history.replaceState(null, "", "/?title=Example&url=https://example.com");

    const { ready, getFirestore, getStore } = setupShareTest(task.id, db, async (firestore) => {
      const batch = writeBatch(firestore.firestore);
      const batchVersion = getCollection(firestore, "batchVersion");
      const lifeLogs = getCollection(firestore, "lifeLogs");

      batch.set(doc(batchVersion, singletonDocumentId), {
        version: "__INITIAL__",
        prevVersion: "",
        createdAt: Timestamp.fromDate(baseTime),
        updatedAt: Timestamp.fromDate(baseTime),
      });

      batch.set(doc(lifeLogs, "$netsurf2"), {
        text: "ネットサーフィン",
        hasTreeNodes: false,
        startAt: Timestamp.fromDate(baseTime),
        endAt: noneTimestamp,
        createdAt: Timestamp.fromDate(baseTime),
        updatedAt: Timestamp.fromDate(baseTime),
      });

      await batch.commit();
    });

    await ready;
    await awaitPendingCallbacks();

    await waitFor(() => {
      expect(window.location.search).toBe("");
    });

    const firestore = getFirestore();
    const treeNodesCol = getCollection(firestore, "lifeLogTreeNodes");
    const nodes = await getDocs(firestore, query(treeNodesCol, where("parentId", "==", "$netsurf2")), {
      fromServer: true,
    });

    expect(nodes).toHaveLength(1);
    expect(nodes[0].text).toBe("[Example](https://example.com)");

    // Check hasTreeNodes was updated
    const lifeLogsCol = getCollection(firestore, "lifeLogs");
    const logs = await getDocs(firestore, query(lifeLogsCol, where("endAt", "==", noneTimestamp)), {
      fromServer: true,
    });
    const netSurfLog = logs.find((l) => l.text === "ネットサーフィン");
    expect(netSurfLog!.hasTreeNodes).toBe(true);

    const store = getStore();
    expect(store.state.panesLifeLogs.selectedLifeLogId).toBe("$netsurf2");
    expect(store.state.panesLifeLogs.selectedLifeLogNodeId).toBe(nodes[0].id);
  });

  it("creates new ネットサーフィン lifeLog when none exists", async ({ db, task }) => {
    history.replaceState(null, "", "/?title=Example&url=https://example.com");

    const { ready, getFirestore, getStore } = setupShareTest(task.id, db, async (firestore) => {
      const batch = writeBatch(firestore.firestore);
      const batchVersion = getCollection(firestore, "batchVersion");

      batch.set(doc(batchVersion, singletonDocumentId), {
        version: "__INITIAL__",
        prevVersion: "",
        createdAt: Timestamp.fromDate(baseTime),
        updatedAt: Timestamp.fromDate(baseTime),
      });

      await batch.commit();
    });

    await ready;
    await awaitPendingCallbacks();

    await waitFor(() => {
      expect(window.location.search).toBe("");
    });

    const firestore = getFirestore();
    const lifeLogsCol = getCollection(firestore, "lifeLogs");
    const logs = await getDocs(firestore, query(lifeLogsCol, where("endAt", "==", noneTimestamp)), {
      fromServer: true,
    });
    const netSurfLog = logs.find((l) => l.text === "ネットサーフィン");
    expect(netSurfLog).toBeTruthy();
    expect(netSurfLog!.hasTreeNodes).toBe(true);
    expect(netSurfLog!.startAt.toMillis()).toBe(Timestamp.fromDate(baseTime).toMillis());

    // Check tree node was created
    const treeNodesCol = getCollection(firestore, "lifeLogTreeNodes");
    const nodes = await getDocs(firestore, query(treeNodesCol, where("parentId", "==", netSurfLog!.id)), {
      fromServer: true,
    });
    expect(nodes).toHaveLength(1);
    expect(nodes[0].text).toBe("[Example](https://example.com)");

    const store = getStore();
    expect(store.state.panesLifeLogs.selectedLifeLogId).toBe(netSurfLog!.id);
    expect(store.state.panesLifeLogs.selectedLifeLogNodeId).toBe(nodes[0].id);
  });

  it("extracts URL from text parameter", async ({ db, task }) => {
    history.replaceState(null, "", "/?title=Example&text=https://example.com");

    const { ready, getFirestore, getStore } = setupShareTest(task.id, db, async (firestore) => {
      const batch = writeBatch(firestore.firestore);
      const batchVersion = getCollection(firestore, "batchVersion");

      batch.set(doc(batchVersion, singletonDocumentId), {
        version: "__INITIAL__",
        prevVersion: "",
        createdAt: Timestamp.fromDate(baseTime),
        updatedAt: Timestamp.fromDate(baseTime),
      });

      await batch.commit();
    });

    await ready;
    await awaitPendingCallbacks();

    await waitFor(() => {
      expect(window.location.search).toBe("");
    });

    const firestore = getFirestore();
    const treeNodesCol = getCollection(firestore, "lifeLogTreeNodes");
    const allNodes = await getDocs(firestore, query(treeNodesCol, where("lifeLogId", "!=", "")), { fromServer: true });
    expect(allNodes).toHaveLength(1);
    expect(allNodes[0].text).toBe("[Example](https://example.com)");

    const store = getStore();
    const lifeLogsCol = getCollection(firestore, "lifeLogs");
    const logs = await getDocs(firestore, query(lifeLogsCol, where("endAt", "==", noneTimestamp)), {
      fromServer: true,
    });
    const netSurfLog = logs.find((l) => l.text === "ネットサーフィン");
    expect(store.state.panesLifeLogs.selectedLifeLogId).toBe(netSurfLog!.id);
    expect(store.state.panesLifeLogs.selectedLifeLogNodeId).toBe(allNodes[0].id);
  });

  it("normalizes Kindle progress share to book progress and resolved amazon.co.jp product link", async ({
    db,
    task,
  }) => {
    const shareText =
      'この本を1%読みました。あなたも気に入るかもしれません - "悪役令嬢転生おじさん(10) (ヤングキングコミックス)" (上山道郎 著)\n\nこちらから無料で読み始められます: https://a.co/03dKDbGh';
    history.replaceState(null, "", `/?title=Kindle&text=${encodeURIComponent(shareText)}`);
    vi.mocked(resolveUrl).mockResolvedValueOnce(
      "https://read.amazon.com/kp/kshare?asin=B0D7DPXQT8&id=fcrvf7rigjfillonun7bacncei",
    );

    const { ready, getFirestore, getStore } = setupShareTest(task.id, db, async (firestore) => {
      const batch = writeBatch(firestore.firestore);
      const batchVersion = getCollection(firestore, "batchVersion");

      batch.set(doc(batchVersion, singletonDocumentId), {
        version: "__INITIAL__",
        prevVersion: "",
        createdAt: Timestamp.fromDate(baseTime),
        updatedAt: Timestamp.fromDate(baseTime),
      });

      await batch.commit();
    });

    await ready;
    await awaitPendingCallbacks();

    await waitFor(() => {
      expect(window.location.search).toBe("");
    });

    const firestore = getFirestore();
    const lifeLogsCol = getCollection(firestore, "lifeLogs");
    const runningLogs = await getDocs(firestore, query(lifeLogsCol, where("endAt", "==", noneTimestamp)), {
      fromServer: true,
    });
    const readingLog = runningLogs.find((l) => l.text === "読書");
    expect(readingLog).toBeTruthy();

    const treeNodesCol = getCollection(firestore, "lifeLogTreeNodes");
    const nodes = await getDocs(firestore, query(treeNodesCol, where("parentId", "==", readingLog!.id)), {
      fromServer: true,
    });
    expect(nodes).toHaveLength(1);
    expect(nodes[0].text).toBe(
      "[悪役令嬢転生おじさん(10) (ヤングキングコミックス) / 上山道郎 / 1%](https://www.amazon.co.jp/dp/B0D7DPXQT8)",
    );

    const store = getStore();
    expect(store.state.panesLifeLogs.selectedLifeLogId).toBe(readingLog!.id);
    expect(store.state.panesLifeLogs.selectedLifeLogNodeId).toBe(nodes[0].id);
    expect(resolveUrl).toHaveBeenCalledWith("https://a.co/03dKDbGh");
    expect(fetchOGPMeta).not.toHaveBeenCalled();
  });

  it("normalizes Kindle finished-reading share to 読了 progress and resolved amazon.co.jp product link", async ({
    db,
    task,
  }) => {
    const shareText =
      'この本を読み終えたところです。あなたも気に入るかもしれません - "悪役令嬢転生おじさん(10) (ヤングキングコミックス)"（上山道郎 著）\n\nこちらから無料で読み始められます: https://a.co/08vpAxiW';
    history.replaceState(null, "", `/?title=Kindle&text=${encodeURIComponent(shareText)}`);
    vi.mocked(resolveUrl).mockResolvedValueOnce(
      "https://read.amazon.com/kp/kshare?asin=B0D7DPXQT8&id=fcrvf7rigjfillonun7bacncei",
    );

    const { ready, getFirestore, getStore } = setupShareTest(task.id, db, async (firestore) => {
      const batch = writeBatch(firestore.firestore);
      const batchVersion = getCollection(firestore, "batchVersion");

      batch.set(doc(batchVersion, singletonDocumentId), {
        version: "__INITIAL__",
        prevVersion: "",
        createdAt: Timestamp.fromDate(baseTime),
        updatedAt: Timestamp.fromDate(baseTime),
      });

      await batch.commit();
    });

    await ready;
    await awaitPendingCallbacks();

    await waitFor(() => {
      expect(window.location.search).toBe("");
    });

    const firestore = getFirestore();
    const lifeLogsCol = getCollection(firestore, "lifeLogs");
    const runningLogs = await getDocs(firestore, query(lifeLogsCol, where("endAt", "==", noneTimestamp)), {
      fromServer: true,
    });
    const readingLog = runningLogs.find((l) => l.text === "読書");
    expect(readingLog).toBeTruthy();

    const treeNodesCol = getCollection(firestore, "lifeLogTreeNodes");
    const nodes = await getDocs(firestore, query(treeNodesCol, where("parentId", "==", readingLog!.id)), {
      fromServer: true,
    });
    expect(nodes).toHaveLength(1);
    expect(nodes[0].text).toBe(
      "[悪役令嬢転生おじさん(10) (ヤングキングコミックス) / 上山道郎 / 読了](https://www.amazon.co.jp/dp/B0D7DPXQT8)",
    );

    const store = getStore();
    expect(store.state.panesLifeLogs.selectedLifeLogId).toBe(readingLog!.id);
    expect(store.state.panesLifeLogs.selectedLifeLogNodeId).toBe(nodes[0].id);
    expect(resolveUrl).toHaveBeenCalledWith("https://a.co/08vpAxiW");
    expect(fetchOGPMeta).not.toHaveBeenCalled();
  });

  it("normalizes Kindle share with ASIN URL to amazon.co.jp product link", async ({ db, task }) => {
    const shareText =
      'この本を12%読みました。あなたも気に入るかもしれません - "サンプル本" (著者名 著)\n\nこちらから無料で読み始められます: https://read.amazon.com/?asin=B012345678';
    history.replaceState(null, "", `/?title=Kindle&text=${encodeURIComponent(shareText)}`);

    const { ready, getFirestore } = setupShareTest(task.id, db, async (firestore) => {
      const batch = writeBatch(firestore.firestore);
      const batchVersion = getCollection(firestore, "batchVersion");

      batch.set(doc(batchVersion, singletonDocumentId), {
        version: "__INITIAL__",
        prevVersion: "",
        createdAt: Timestamp.fromDate(baseTime),
        updatedAt: Timestamp.fromDate(baseTime),
      });

      await batch.commit();
    });

    await ready;
    await awaitPendingCallbacks();

    const firestore = getFirestore();
    const treeNodesCol = getCollection(firestore, "lifeLogTreeNodes");
    const allNodes = await getDocs(firestore, query(treeNodesCol, where("lifeLogId", "!=", "")), {
      fromServer: true,
    });
    expect(allNodes).toHaveLength(1);
    expect(allNodes[0].text).toBe("[サンプル本 / 著者名 / 12%](https://www.amazon.co.jp/dp/B012345678)");
  });

  it("updates existing Kindle progress share for the same book instead of adding duplicate", async ({ db, task }) => {
    const shareText =
      'この本を12%読みました。あなたも気に入るかもしれません - "サンプル本" (著者名 著)\n\nこちらから無料で読み始められます: https://read.amazon.com/?asin=B012345678';
    history.replaceState(null, "", `/?title=Kindle&text=${encodeURIComponent(shareText)}`);

    const { ready, getFirestore, getStore, getShareResult } = setupShareTest(task.id, db, async (firestore) => {
      const batch = writeBatch(firestore.firestore);
      const batchVersion = getCollection(firestore, "batchVersion");
      const lifeLogs = getCollection(firestore, "lifeLogs");
      const lifeLogTreeNodes = getCollection(firestore, "lifeLogTreeNodes");

      batch.set(doc(batchVersion, singletonDocumentId), {
        version: "__INITIAL__",
        prevVersion: "",
        createdAt: Timestamp.fromDate(baseTime),
        updatedAt: Timestamp.fromDate(baseTime),
      });

      batch.set(doc(lifeLogs, "$reading-kindle-progress"), {
        text: "読書",
        hasTreeNodes: true,
        startAt: Timestamp.fromDate(baseTime),
        endAt: noneTimestamp,
        createdAt: Timestamp.fromDate(baseTime),
        updatedAt: Timestamp.fromDate(baseTime),
      });

      batch.set(doc(lifeLogTreeNodes, "$node-kindle-progress"), {
        text: "[サンプル本 / 著者名 / 1%](https://www.amazon.co.jp/dp/B012345678)",
        lifeLogId: "$reading-kindle-progress",
        parentId: "$reading-kindle-progress",
        order: "a0",
        createdAt: Timestamp.fromDate(baseTime),
        updatedAt: Timestamp.fromDate(baseTime),
      });

      batch.set(doc(lifeLogs, "$netsurf-kindle-progress"), {
        text: "ネットサーフィン",
        hasTreeNodes: true,
        startAt: Timestamp.fromDate(baseTime),
        endAt: noneTimestamp,
        createdAt: Timestamp.fromDate(baseTime),
        updatedAt: Timestamp.fromDate(baseTime),
      });

      await batch.commit();
    });

    await ready;
    await awaitPendingCallbacks();

    const firestore = getFirestore();
    const treeNodesCol = getCollection(firestore, "lifeLogTreeNodes");
    const nodes = await getDocs(firestore, query(treeNodesCol, where("parentId", "==", "$reading-kindle-progress")), {
      fromServer: true,
    });
    expect(nodes).toHaveLength(1);
    expect(nodes[0].id).toBe("$node-kindle-progress");
    expect(nodes[0].text).toBe("[サンプル本 / 著者名 / 12%](https://www.amazon.co.jp/dp/B012345678)");

    const lifeLogsCol = getCollection(firestore, "lifeLogs");
    const netSurfLogs = await getDocs(firestore, query(lifeLogsCol, where("text", "==", "ネットサーフィン")), {
      fromServer: true,
    });
    const netSurfLog = netSurfLogs.find((l) => l.id === "$netsurf-kindle-progress");
    expect(netSurfLog).toBeTruthy();
    expect(netSurfLog!.endAt).toEqual(noneTimestamp);

    const store = getStore();
    expect(store.state.panesLifeLogs.selectedLifeLogId).toBe("$reading-kindle-progress");
    expect(store.state.panesLifeLogs.selectedLifeLogNodeId).toBe("$node-kindle-progress");
    expect(getShareResult()?.status).toBe("updated");
  });

  it("updates existing Kindle percentage progress share to finished-reading progress", async ({ db, task }) => {
    const shareText =
      'この本を読み終えたところです。あなたも気に入るかもしれません - "サンプル本"（著者名 著）\n\nこちらから無料で読み始められます: https://read.amazon.com/?asin=B012345678';
    history.replaceState(null, "", `/?title=Kindle&text=${encodeURIComponent(shareText)}`);

    const { ready, getFirestore, getStore, getShareResult } = setupShareTest(task.id, db, async (firestore) => {
      const batch = writeBatch(firestore.firestore);
      const batchVersion = getCollection(firestore, "batchVersion");
      const lifeLogs = getCollection(firestore, "lifeLogs");
      const lifeLogTreeNodes = getCollection(firestore, "lifeLogTreeNodes");

      batch.set(doc(batchVersion, singletonDocumentId), {
        version: "__INITIAL__",
        prevVersion: "",
        createdAt: Timestamp.fromDate(baseTime),
        updatedAt: Timestamp.fromDate(baseTime),
      });

      batch.set(doc(lifeLogs, "$reading-kindle-finished"), {
        text: "読書",
        hasTreeNodes: true,
        startAt: Timestamp.fromDate(baseTime),
        endAt: noneTimestamp,
        createdAt: Timestamp.fromDate(baseTime),
        updatedAt: Timestamp.fromDate(baseTime),
      });

      batch.set(doc(lifeLogTreeNodes, "$node-kindle-finished"), {
        text: "[サンプル本 / 著者名 / 12%](https://www.amazon.co.jp/dp/B012345678)",
        lifeLogId: "$reading-kindle-finished",
        parentId: "$reading-kindle-finished",
        order: "a0",
        createdAt: Timestamp.fromDate(baseTime),
        updatedAt: Timestamp.fromDate(baseTime),
      });

      await batch.commit();
    });

    await ready;
    await awaitPendingCallbacks();

    const firestore = getFirestore();
    const treeNodesCol = getCollection(firestore, "lifeLogTreeNodes");
    const nodes = await getDocs(firestore, query(treeNodesCol, where("parentId", "==", "$reading-kindle-finished")), {
      fromServer: true,
    });
    expect(nodes).toHaveLength(1);
    expect(nodes[0].id).toBe("$node-kindle-finished");
    expect(nodes[0].text).toBe("[サンプル本 / 著者名 / 読了](https://www.amazon.co.jp/dp/B012345678)");

    const store = getStore();
    expect(store.state.panesLifeLogs.selectedLifeLogId).toBe("$reading-kindle-finished");
    expect(store.state.panesLifeLogs.selectedLifeLogNodeId).toBe("$node-kindle-finished");
    expect(getShareResult()?.status).toBe("updated");
  });

  it("keeps existing Kindle progress share unchanged when the progress is already current", async ({ db, task }) => {
    const shareText =
      'この本を12%読みました。あなたも気に入るかもしれません - "サンプル本" (著者名 著)\n\nこちらから無料で読み始められます: https://read.amazon.com/?asin=B012345678';
    history.replaceState(null, "", `/?title=Kindle&text=${encodeURIComponent(shareText)}`);

    const { ready, getFirestore, getShareResult } = setupShareTest(task.id, db, async (firestore) => {
      const batch = writeBatch(firestore.firestore);
      const batchVersion = getCollection(firestore, "batchVersion");
      const lifeLogs = getCollection(firestore, "lifeLogs");
      const lifeLogTreeNodes = getCollection(firestore, "lifeLogTreeNodes");

      batch.set(doc(batchVersion, singletonDocumentId), {
        version: "__INITIAL__",
        prevVersion: "",
        createdAt: Timestamp.fromDate(baseTime),
        updatedAt: Timestamp.fromDate(baseTime),
      });

      batch.set(doc(lifeLogs, "$reading-kindle-current"), {
        text: "読書",
        hasTreeNodes: true,
        startAt: Timestamp.fromDate(baseTime),
        endAt: noneTimestamp,
        createdAt: Timestamp.fromDate(baseTime),
        updatedAt: Timestamp.fromDate(baseTime),
      });

      batch.set(doc(lifeLogTreeNodes, "$node-kindle-current"), {
        text: "[サンプル本 / 著者名 / 12%](https://www.amazon.co.jp/dp/B012345678)",
        lifeLogId: "$reading-kindle-current",
        parentId: "$reading-kindle-current",
        order: "a0",
        createdAt: Timestamp.fromDate(baseTime),
        updatedAt: Timestamp.fromDate(baseTime),
      });

      await batch.commit();
    });

    await ready;
    await awaitPendingCallbacks();

    const firestore = getFirestore();
    const treeNodesCol = getCollection(firestore, "lifeLogTreeNodes");
    const nodes = await getDocs(firestore, query(treeNodesCol, where("parentId", "==", "$reading-kindle-current")), {
      fromServer: true,
    });
    expect(nodes).toHaveLength(1);
    expect(nodes[0].id).toBe("$node-kindle-current");
    expect(nodes[0].text).toBe("[サンプル本 / 著者名 / 12%](https://www.amazon.co.jp/dp/B012345678)");
    expect(getShareResult()?.status).toBe("duplicate");
  });

  it("creates 読書 lifeLog for ncode.syosetu.com URL", async ({ db, task }) => {
    history.replaceState(null, "", "/?title=Novel&url=https://ncode.syosetu.com/n1234ab/");

    const { ready, getFirestore, getStore } = setupShareTest(task.id, db, async (firestore) => {
      const batch = writeBatch(firestore.firestore);
      const batchVersion = getCollection(firestore, "batchVersion");

      batch.set(doc(batchVersion, singletonDocumentId), {
        version: "__INITIAL__",
        prevVersion: "",
        createdAt: Timestamp.fromDate(baseTime),
        updatedAt: Timestamp.fromDate(baseTime),
      });

      await batch.commit();
    });

    await ready;
    await awaitPendingCallbacks();

    await waitFor(() => {
      expect(window.location.search).toBe("");
    });

    const firestore = getFirestore();
    const lifeLogsCol = getCollection(firestore, "lifeLogs");
    const logs = await getDocs(firestore, query(lifeLogsCol, where("endAt", "==", noneTimestamp)), {
      fromServer: true,
    });
    const readingLog = logs.find((l) => l.text === "読書");
    expect(readingLog).toBeTruthy();
    expect(readingLog!.hasTreeNodes).toBe(true);

    const treeNodesCol = getCollection(firestore, "lifeLogTreeNodes");
    const nodes = await getDocs(firestore, query(treeNodesCol, where("parentId", "==", readingLog!.id)), {
      fromServer: true,
    });
    expect(nodes).toHaveLength(1);
    expect(nodes[0].text).toBe("[Novel](https://ncode.syosetu.com/n1234ab/)");

    const store = getStore();
    expect(store.state.panesLifeLogs.selectedLifeLogId).toBe(readingLog!.id);
    expect(store.state.panesLifeLogs.selectedLifeLogNodeId).toBe(nodes[0].id);
  });

  it("creates 読書 lifeLog for kakuyomu.jp URL", async ({ db, task }) => {
    history.replaceState(null, "", "/?title=Work&url=https://kakuyomu.jp/works/123");

    const { ready, getFirestore, getStore } = setupShareTest(task.id, db, async (firestore) => {
      const batch = writeBatch(firestore.firestore);
      const batchVersion = getCollection(firestore, "batchVersion");

      batch.set(doc(batchVersion, singletonDocumentId), {
        version: "__INITIAL__",
        prevVersion: "",
        createdAt: Timestamp.fromDate(baseTime),
        updatedAt: Timestamp.fromDate(baseTime),
      });

      await batch.commit();
    });

    await ready;
    await awaitPendingCallbacks();

    await waitFor(() => {
      expect(window.location.search).toBe("");
    });

    const firestore = getFirestore();
    const lifeLogsCol = getCollection(firestore, "lifeLogs");
    const logs = await getDocs(firestore, query(lifeLogsCol, where("endAt", "==", noneTimestamp)), {
      fromServer: true,
    });
    const readingLog = logs.find((l) => l.text === "読書");
    expect(readingLog).toBeTruthy();
    expect(readingLog!.hasTreeNodes).toBe(true);

    const treeNodesCol = getCollection(firestore, "lifeLogTreeNodes");
    const nodes = await getDocs(firestore, query(treeNodesCol, where("parentId", "==", readingLog!.id)), {
      fromServer: true,
    });
    expect(nodes).toHaveLength(1);
    expect(nodes[0].text).toBe("[Work](https://kakuyomu.jp/works/123)");

    const store = getStore();
    expect(store.state.panesLifeLogs.selectedLifeLogId).toBe(readingLog!.id);
    expect(store.state.panesLifeLogs.selectedLifeLogNodeId).toBe(nodes[0].id);
  });

  it("creates 読書 lifeLog for manga.nicovideo.jp URL", async ({ db, task }) => {
    history.replaceState(null, "", "/?title=Manga&url=https://manga.nicovideo.jp/comic/12345");

    const { ready, getFirestore, getStore } = setupShareTest(task.id, db, async (firestore) => {
      const batch = writeBatch(firestore.firestore);
      const batchVersion = getCollection(firestore, "batchVersion");

      batch.set(doc(batchVersion, singletonDocumentId), {
        version: "__INITIAL__",
        prevVersion: "",
        createdAt: Timestamp.fromDate(baseTime),
        updatedAt: Timestamp.fromDate(baseTime),
      });

      await batch.commit();
    });

    await ready;
    await awaitPendingCallbacks();

    await waitFor(() => {
      expect(window.location.search).toBe("");
    });

    const firestore = getFirestore();
    const lifeLogsCol = getCollection(firestore, "lifeLogs");
    const logs = await getDocs(firestore, query(lifeLogsCol, where("endAt", "==", noneTimestamp)), {
      fromServer: true,
    });
    const readingLog = logs.find((l) => l.text === "読書");
    expect(readingLog).toBeTruthy();
    expect(readingLog!.hasTreeNodes).toBe(true);

    const treeNodesCol = getCollection(firestore, "lifeLogTreeNodes");
    const nodes = await getDocs(firestore, query(treeNodesCol, where("parentId", "==", readingLog!.id)), {
      fromServer: true,
    });
    expect(nodes).toHaveLength(1);
    expect(nodes[0].text).toBe("[Manga](https://manga.nicovideo.jp/comic/12345)");

    const store = getStore();
    expect(store.state.panesLifeLogs.selectedLifeLogId).toBe(readingLog!.id);
    expect(store.state.panesLifeLogs.selectedLifeLogNodeId).toBe(nodes[0].id);
  });

  it("creates 読書 lifeLog for shonenjumpplus.com URL", async ({ db, task }) => {
    history.replaceState(null, "", "/?title=Jump&url=https://shonenjumpplus.com/episode/123");

    const { ready, getFirestore, getStore } = setupShareTest(task.id, db, async (firestore) => {
      const batch = writeBatch(firestore.firestore);
      const batchVersion = getCollection(firestore, "batchVersion");

      batch.set(doc(batchVersion, singletonDocumentId), {
        version: "__INITIAL__",
        prevVersion: "",
        createdAt: Timestamp.fromDate(baseTime),
        updatedAt: Timestamp.fromDate(baseTime),
      });

      await batch.commit();
    });

    await ready;
    await awaitPendingCallbacks();

    await waitFor(() => {
      expect(window.location.search).toBe("");
    });

    const firestore = getFirestore();
    const lifeLogsCol = getCollection(firestore, "lifeLogs");
    const logs = await getDocs(firestore, query(lifeLogsCol, where("endAt", "==", noneTimestamp)), {
      fromServer: true,
    });
    const readingLog = logs.find((l) => l.text === "読書");
    expect(readingLog).toBeTruthy();
    expect(readingLog!.hasTreeNodes).toBe(true);

    const treeNodesCol = getCollection(firestore, "lifeLogTreeNodes");
    const nodes = await getDocs(firestore, query(treeNodesCol, where("parentId", "==", readingLog!.id)), {
      fromServer: true,
    });
    expect(nodes).toHaveLength(1);
    expect(nodes[0].text).toBe("[Jump](https://shonenjumpplus.com/episode/123)");

    const store = getStore();
    expect(store.state.panesLifeLogs.selectedLifeLogId).toBe(readingLog!.id);
    expect(store.state.panesLifeLogs.selectedLifeLogNodeId).toBe(nodes[0].id);
  });

  it("appends to existing running 読書 for syosetu.org URL", async ({ db, task }) => {
    history.replaceState(null, "", "/?title=Novel&url=https://syosetu.org/novel/123/");

    const { ready, getFirestore, getStore } = setupShareTest(task.id, db, async (firestore) => {
      const batch = writeBatch(firestore.firestore);
      const batchVersion = getCollection(firestore, "batchVersion");
      const lifeLogs = getCollection(firestore, "lifeLogs");
      const lifeLogTreeNodes = getCollection(firestore, "lifeLogTreeNodes");

      batch.set(doc(batchVersion, singletonDocumentId), {
        version: "__INITIAL__",
        prevVersion: "",
        createdAt: Timestamp.fromDate(baseTime),
        updatedAt: Timestamp.fromDate(baseTime),
      });

      batch.set(doc(lifeLogs, "$reading1"), {
        text: "読書",
        hasTreeNodes: true,
        startAt: Timestamp.fromDate(baseTime),
        endAt: noneTimestamp,
        createdAt: Timestamp.fromDate(baseTime),
        updatedAt: Timestamp.fromDate(baseTime),
      });

      batch.set(doc(lifeLogTreeNodes, "$rnode1"), {
        text: "existing reading node",
        lifeLogId: "$reading1",
        parentId: "$reading1",
        order: "a0",
        createdAt: Timestamp.fromDate(baseTime),
        updatedAt: Timestamp.fromDate(baseTime),
      });

      await batch.commit();
    });

    await ready;
    await awaitPendingCallbacks();

    await waitFor(() => {
      expect(window.location.search).toBe("");
    });

    const firestore = getFirestore();
    const treeNodesCol = getCollection(firestore, "lifeLogTreeNodes");
    const nodes = await getDocs(firestore, query(treeNodesCol, where("parentId", "==", "$reading1")), {
      fromServer: true,
    });

    expect(nodes).toHaveLength(2);
    const newNode = nodes.find((n) => n.text === "[Novel](https://syosetu.org/novel/123/)");
    expect(newNode).toBeTruthy();
    expect(newNode!.order > "a0").toBe(true);

    const store = getStore();
    expect(store.state.panesLifeLogs.selectedLifeLogId).toBe("$reading1");
    expect(store.state.panesLifeLogs.selectedLifeLogNodeId).toBe(newNode!.id);
  });

  it("creates ネットサーフィン lifeLog for amazon.co.jp product URL and normalizes it", async ({ db, task }) => {
    const productUrl = "https://www.amazon.co.jp/十戒-講談社文庫-夕木春央-ebook/dp/B0FHPWB4KS?ref_=cm_sw_r";
    history.replaceState(null, "", `/?title=${encodeURIComponent("十戒")}&url=${encodeURIComponent(productUrl)}`);

    const { ready, getFirestore, getStore } = setupShareTest(task.id, db, async (firestore) => {
      const batch = writeBatch(firestore.firestore);
      const batchVersion = getCollection(firestore, "batchVersion");

      batch.set(doc(batchVersion, singletonDocumentId), {
        version: "__INITIAL__",
        prevVersion: "",
        createdAt: Timestamp.fromDate(baseTime),
        updatedAt: Timestamp.fromDate(baseTime),
      });

      await batch.commit();
    });

    await ready;
    await awaitPendingCallbacks();

    await waitFor(() => {
      expect(window.location.search).toBe("");
    });

    const firestore = getFirestore();
    const lifeLogsCol = getCollection(firestore, "lifeLogs");
    const logs = await getDocs(firestore, query(lifeLogsCol, where("endAt", "==", noneTimestamp)), {
      fromServer: true,
    });
    const netSurfLog = logs.find((l) => l.text === "ネットサーフィン");
    expect(netSurfLog).toBeTruthy();
    expect(logs.find((l) => l.text === "読書")).toBeUndefined();

    const treeNodesCol = getCollection(firestore, "lifeLogTreeNodes");
    const nodes = await getDocs(firestore, query(treeNodesCol, where("parentId", "==", netSurfLog!.id)), {
      fromServer: true,
    });
    expect(nodes).toHaveLength(1);
    expect(nodes[0].text).toBe("[十戒](https://www.amazon.co.jp/dp/B0FHPWB4KS)");

    const store = getStore();
    expect(store.state.panesLifeLogs.selectedLifeLogId).toBe(netSurfLog!.id);
    expect(store.state.panesLifeLogs.selectedLifeLogNodeId).toBe(nodes[0].id);
  });

  it("keeps amazon.co.jp URL without ASIN as-is", async ({ db, task }) => {
    const searchUrl = "https://www.amazon.co.jp/s?k=test";
    history.replaceState(null, "", `/?title=Search&url=${encodeURIComponent(searchUrl)}`);

    const { ready, getFirestore } = setupShareTest(task.id, db, async (firestore) => {
      const batch = writeBatch(firestore.firestore);
      const batchVersion = getCollection(firestore, "batchVersion");

      batch.set(doc(batchVersion, singletonDocumentId), {
        version: "__INITIAL__",
        prevVersion: "",
        createdAt: Timestamp.fromDate(baseTime),
        updatedAt: Timestamp.fromDate(baseTime),
      });

      await batch.commit();
    });

    await ready;
    await awaitPendingCallbacks();

    await waitFor(() => {
      expect(window.location.search).toBe("");
    });

    const firestore = getFirestore();
    const lifeLogsCol = getCollection(firestore, "lifeLogs");
    const logs = await getDocs(firestore, query(lifeLogsCol, where("endAt", "==", noneTimestamp)), {
      fromServer: true,
    });
    const netSurfLog = logs.find((l) => l.text === "ネットサーフィン");
    expect(netSurfLog).toBeTruthy();

    const treeNodesCol = getCollection(firestore, "lifeLogTreeNodes");
    const nodes = await getDocs(firestore, query(treeNodesCol, where("parentId", "==", netSurfLog!.id)), {
      fromServer: true,
    });
    expect(nodes).toHaveLength(1);
    expect(nodes[0].text).toBe("[Search](https://www.amazon.co.jp/s?k=test)");
  });

  it("detects duplicate when slug-form amazon.co.jp URL matches normalized existing node", async ({ db, task }) => {
    const productUrl = "https://www.amazon.co.jp/十戒-講談社文庫-夕木春央-ebook/dp/B0FHPWB4KS";
    history.replaceState(null, "", `/?title=${encodeURIComponent("十戒")}&url=${encodeURIComponent(productUrl)}`);

    const { ready, getFirestore, getStore, getShareResult } = setupShareTest(task.id, db, async (firestore) => {
      const batch = writeBatch(firestore.firestore);
      const batchVersion = getCollection(firestore, "batchVersion");
      const lifeLogs = getCollection(firestore, "lifeLogs");
      const lifeLogTreeNodes = getCollection(firestore, "lifeLogTreeNodes");

      batch.set(doc(batchVersion, singletonDocumentId), {
        version: "__INITIAL__",
        prevVersion: "",
        createdAt: Timestamp.fromDate(baseTime),
        updatedAt: Timestamp.fromDate(baseTime),
      });

      batch.set(doc(lifeLogs, "$netsurf-amazon"), {
        text: "ネットサーフィン",
        hasTreeNodes: true,
        startAt: Timestamp.fromDate(baseTime),
        endAt: noneTimestamp,
        createdAt: Timestamp.fromDate(baseTime),
        updatedAt: Timestamp.fromDate(baseTime),
      });

      batch.set(doc(lifeLogTreeNodes, "$node-amazon"), {
        text: "[十戒](https://www.amazon.co.jp/dp/B0FHPWB4KS)",
        lifeLogId: "$netsurf-amazon",
        parentId: "$netsurf-amazon",
        order: "a0",
        createdAt: Timestamp.fromDate(baseTime),
        updatedAt: Timestamp.fromDate(baseTime),
      });

      await batch.commit();
    });

    await ready;
    await awaitPendingCallbacks();

    await waitFor(() => {
      expect(window.location.search).toBe("");
    });

    expect(getShareResult()).toEqual({
      lifeLogId: "$netsurf-amazon",
      nodeId: "$node-amazon",
      status: "duplicate",
    });

    const firestore = getFirestore();
    const treeNodesCol = getCollection(firestore, "lifeLogTreeNodes");
    const nodes = await getDocs(firestore, query(treeNodesCol, where("parentId", "==", "$netsurf-amazon")), {
      fromServer: true,
    });

    // Should still have only 1 node (no duplicate added)
    expect(nodes).toHaveLength(1);
    expect(nodes[0].text).toBe("[十戒](https://www.amazon.co.jp/dp/B0FHPWB4KS)");

    const store = getStore();
    expect(store.state.panesLifeLogs.selectedLifeLogId).toBe("$netsurf-amazon");
    expect(store.state.panesLifeLogs.selectedLifeLogNodeId).toBe("$node-amazon");
  });

  it("ends running 読書 when sharing amazon.co.jp product URL", async ({ db, task }) => {
    // Bare hostname (no www.) also gets normalized
    const productUrl = "https://amazon.co.jp/十戒-講談社文庫-夕木春央-ebook/dp/B0FHPWB4KS";
    history.replaceState(null, "", `/?title=${encodeURIComponent("十戒")}&url=${encodeURIComponent(productUrl)}`);

    const { ready, getFirestore, getStore } = setupShareTest(task.id, db, async (firestore) => {
      const batch = writeBatch(firestore.firestore);
      const batchVersion = getCollection(firestore, "batchVersion");
      const lifeLogs = getCollection(firestore, "lifeLogs");

      batch.set(doc(batchVersion, singletonDocumentId), {
        version: "__INITIAL__",
        prevVersion: "",
        createdAt: Timestamp.fromDate(baseTime),
        updatedAt: Timestamp.fromDate(baseTime),
      });

      batch.set(doc(lifeLogs, "$reading-amazon"), {
        text: "読書",
        hasTreeNodes: true,
        startAt: Timestamp.fromDate(baseTime),
        endAt: noneTimestamp,
        createdAt: Timestamp.fromDate(baseTime),
        updatedAt: Timestamp.fromDate(baseTime),
      });

      await batch.commit();
    });

    await ready;
    await awaitPendingCallbacks();

    await waitFor(() => {
      expect(window.location.search).toBe("");
    });

    const firestore = getFirestore();
    const lifeLogsCol = getCollection(firestore, "lifeLogs");

    // 読書 should be ended
    const allLogs = await getDocs(firestore, query(lifeLogsCol, where("text", "==", "読書")), { fromServer: true });
    const endedLog = allLogs.find((l) => l.id === "$reading-amazon");
    expect(endedLog).toBeTruthy();
    expect(endedLog!.endAt.toMillis()).toBe(Timestamp.fromDate(baseTime).toMillis());

    // New ネットサーフィン should be created
    const runningLogs = await getDocs(firestore, query(lifeLogsCol, where("endAt", "==", noneTimestamp)), {
      fromServer: true,
    });
    const netSurfLog = runningLogs.find((l) => l.text === "ネットサーフィン");
    expect(netSurfLog).toBeTruthy();

    const treeNodesCol = getCollection(firestore, "lifeLogTreeNodes");
    const nodes = await getDocs(firestore, query(treeNodesCol, where("parentId", "==", netSurfLog!.id)), {
      fromServer: true,
    });
    expect(nodes).toHaveLength(1);
    expect(nodes[0].text).toBe("[十戒](https://www.amazon.co.jp/dp/B0FHPWB4KS)");

    const store = getStore();
    expect(store.state.panesLifeLogs.selectedLifeLogId).toBe(netSurfLog!.id);
    expect(store.state.panesLifeLogs.selectedLifeLogNodeId).toBe(nodes[0].id);
  });

  it("asks for confirmation when slug-form amazon.co.jp URL was shared in the past", async ({ db, task }) => {
    const productUrl = "https://www.amazon.co.jp/十戒-講談社文庫-夕木春央-ebook/dp/B0FHPWB4KS";
    history.replaceState(null, "", `/?title=${encodeURIComponent("十戒")}&url=${encodeURIComponent(productUrl)}`);

    const { ready, getFirestore, getShareResult } = setupShareTest(task.id, db, async (firestore) => {
      const batch = writeBatch(firestore.firestore);
      const batchVersion = getCollection(firestore, "batchVersion");
      const lifeLogs = getCollection(firestore, "lifeLogs");
      const lifeLogTreeNodes = getCollection(firestore, "lifeLogTreeNodes");

      batch.set(doc(batchVersion, singletonDocumentId), {
        version: "__INITIAL__",
        prevVersion: "",
        createdAt: Timestamp.fromDate(baseTime),
        updatedAt: Timestamp.fromDate(baseTime),
      });

      batch.set(doc(lifeLogs, "$netsurf-past-amazon"), {
        text: "ネットサーフィン",
        hasTreeNodes: true,
        startAt: Timestamp.fromDate(new Date(2026, 0, 1, 10, 0, 0, 0)),
        endAt: Timestamp.fromDate(new Date(2026, 0, 1, 11, 0, 0, 0)),
        createdAt: Timestamp.fromDate(baseTime),
        updatedAt: Timestamp.fromDate(baseTime),
      });

      const pastNodeText = "[十戒](https://www.amazon.co.jp/dp/B0FHPWB4KS)";
      batch.set(doc(lifeLogTreeNodes, "$node-past-amazon"), {
        text: pastNodeText,
        lifeLogId: "$netsurf-past-amazon",
        parentId: "$netsurf-past-amazon",
        order: "a0",
        createdAt: Timestamp.fromDate(baseTime),
        updatedAt: Timestamp.fromDate(baseTime),
      });
      setNgramDoc(batch, firestore, "$node-past-amazon", "lifeLogTreeNodes", pastNodeText);

      await batch.commit();
    });

    await ready;
    await awaitPendingCallbacks();

    await waitFor(() => {
      expect(window.location.search).toBe("");
    });

    // Past share is found by the normalized URL, asking for confirmation
    expect(getShareResult()).toEqual({
      status: "needsConfirmation",
      url: "https://www.amazon.co.jp/dp/B0FHPWB4KS",
      markdownLink: "[十戒](https://www.amazon.co.jp/dp/B0FHPWB4KS)",
      existingNodeId: "$node-past-amazon",
      existingNodeText: "[十戒](https://www.amazon.co.jp/dp/B0FHPWB4KS)",
    });

    // Nothing should be added yet
    const firestore = getFirestore();
    const lifeLogsCol = getCollection(firestore, "lifeLogs");
    const runningLogs = await getDocs(firestore, query(lifeLogsCol, where("endAt", "==", noneTimestamp)), {
      fromServer: true,
    });
    expect(runningLogs).toHaveLength(0);
  });

  it("ends running ネットサーフィン when creating new 読書", async ({ db, task }) => {
    history.replaceState(null, "", "/?title=Novel&url=https://ncode.syosetu.com/n1234ab/");

    const { ready, getFirestore, getStore } = setupShareTest(task.id, db, async (firestore) => {
      const batch = writeBatch(firestore.firestore);
      const batchVersion = getCollection(firestore, "batchVersion");
      const lifeLogs = getCollection(firestore, "lifeLogs");

      batch.set(doc(batchVersion, singletonDocumentId), {
        version: "__INITIAL__",
        prevVersion: "",
        createdAt: Timestamp.fromDate(baseTime),
        updatedAt: Timestamp.fromDate(baseTime),
      });

      batch.set(doc(lifeLogs, "$netsurf-excl1"), {
        text: "ネットサーフィン",
        hasTreeNodes: true,
        startAt: Timestamp.fromDate(baseTime),
        endAt: noneTimestamp,
        createdAt: Timestamp.fromDate(baseTime),
        updatedAt: Timestamp.fromDate(baseTime),
      });

      await batch.commit();
    });

    await ready;
    await awaitPendingCallbacks();

    await waitFor(() => {
      expect(window.location.search).toBe("");
    });

    const firestore = getFirestore();
    const lifeLogsCol = getCollection(firestore, "lifeLogs");

    // ネットサーフィン should be ended
    const allLogs = await getDocs(firestore, query(lifeLogsCol, where("text", "==", "ネットサーフィン")), {
      fromServer: true,
    });
    const endedLog = allLogs.find((l) => l.id === "$netsurf-excl1");
    expect(endedLog).toBeTruthy();
    expect(endedLog!.endAt.toMillis()).toBe(Timestamp.fromDate(baseTime).toMillis());

    // New 読書 should be created with same startAt
    const runningLogs = await getDocs(firestore, query(lifeLogsCol, where("endAt", "==", noneTimestamp)), {
      fromServer: true,
    });
    const readingLog = runningLogs.find((l) => l.text === "読書");
    expect(readingLog).toBeTruthy();
    expect(readingLog!.startAt.toMillis()).toBe(Timestamp.fromDate(baseTime).toMillis());

    const store = getStore();
    expect(store.state.panesLifeLogs.selectedLifeLogId).toBe(readingLog!.id);
  });

  it("ends running 読書 when creating new ネットサーフィン", async ({ db, task }) => {
    history.replaceState(null, "", "/?title=Example&url=https://example.com");

    const { ready, getFirestore, getStore } = setupShareTest(task.id, db, async (firestore) => {
      const batch = writeBatch(firestore.firestore);
      const batchVersion = getCollection(firestore, "batchVersion");
      const lifeLogs = getCollection(firestore, "lifeLogs");

      batch.set(doc(batchVersion, singletonDocumentId), {
        version: "__INITIAL__",
        prevVersion: "",
        createdAt: Timestamp.fromDate(baseTime),
        updatedAt: Timestamp.fromDate(baseTime),
      });

      batch.set(doc(lifeLogs, "$reading-excl1"), {
        text: "読書",
        hasTreeNodes: true,
        startAt: Timestamp.fromDate(baseTime),
        endAt: noneTimestamp,
        createdAt: Timestamp.fromDate(baseTime),
        updatedAt: Timestamp.fromDate(baseTime),
      });

      await batch.commit();
    });

    await ready;
    await awaitPendingCallbacks();

    await waitFor(() => {
      expect(window.location.search).toBe("");
    });

    const firestore = getFirestore();
    const lifeLogsCol = getCollection(firestore, "lifeLogs");

    // 読書 should be ended
    const allLogs = await getDocs(firestore, query(lifeLogsCol, where("text", "==", "読書")), { fromServer: true });
    const endedLog = allLogs.find((l) => l.id === "$reading-excl1");
    expect(endedLog).toBeTruthy();
    expect(endedLog!.endAt.toMillis()).toBe(Timestamp.fromDate(baseTime).toMillis());

    // New ネットサーフィン should be created with same startAt
    const runningLogs = await getDocs(firestore, query(lifeLogsCol, where("endAt", "==", noneTimestamp)), {
      fromServer: true,
    });
    const netSurfLog = runningLogs.find((l) => l.text === "ネットサーフィン");
    expect(netSurfLog).toBeTruthy();
    expect(netSurfLog!.startAt.toMillis()).toBe(Timestamp.fromDate(baseTime).toMillis());

    const store = getStore();
    expect(store.state.panesLifeLogs.selectedLifeLogId).toBe(netSurfLog!.id);
  });

  it("ends running ネットサーフィン when appending to existing 読書", async ({ db, task }) => {
    history.replaceState(null, "", "/?title=Novel&url=https://ncode.syosetu.com/n1234ab/");

    const { ready, getFirestore, getStore } = setupShareTest(task.id, db, async (firestore) => {
      const batch = writeBatch(firestore.firestore);
      const batchVersion = getCollection(firestore, "batchVersion");
      const lifeLogs = getCollection(firestore, "lifeLogs");
      const lifeLogTreeNodes = getCollection(firestore, "lifeLogTreeNodes");

      batch.set(doc(batchVersion, singletonDocumentId), {
        version: "__INITIAL__",
        prevVersion: "",
        createdAt: Timestamp.fromDate(baseTime),
        updatedAt: Timestamp.fromDate(baseTime),
      });

      batch.set(doc(lifeLogs, "$reading-both1"), {
        text: "読書",
        hasTreeNodes: true,
        startAt: Timestamp.fromDate(baseTime),
        endAt: noneTimestamp,
        createdAt: Timestamp.fromDate(baseTime),
        updatedAt: Timestamp.fromDate(baseTime),
      });

      batch.set(doc(lifeLogTreeNodes, "$rnode-both1"), {
        text: "existing reading node",
        lifeLogId: "$reading-both1",
        parentId: "$reading-both1",
        order: "a0",
        createdAt: Timestamp.fromDate(baseTime),
        updatedAt: Timestamp.fromDate(baseTime),
      });

      batch.set(doc(lifeLogs, "$netsurf-both1"), {
        text: "ネットサーフィン",
        hasTreeNodes: true,
        startAt: Timestamp.fromDate(baseTime),
        endAt: noneTimestamp,
        createdAt: Timestamp.fromDate(baseTime),
        updatedAt: Timestamp.fromDate(baseTime),
      });

      await batch.commit();
    });

    await ready;
    await awaitPendingCallbacks();

    await waitFor(() => {
      expect(window.location.search).toBe("");
    });

    const firestore = getFirestore();
    const lifeLogsCol = getCollection(firestore, "lifeLogs");

    // ネットサーフィン should be ended
    const allLogs = await getDocs(firestore, query(lifeLogsCol, where("text", "==", "ネットサーフィン")), {
      fromServer: true,
    });
    const endedLog = allLogs.find((l) => l.id === "$netsurf-both1");
    expect(endedLog).toBeTruthy();
    expect(endedLog!.endAt.toMillis()).toBe(Timestamp.fromDate(baseTime).toMillis());

    // 読書 should still be running
    const runningLogs = await getDocs(firestore, query(lifeLogsCol, where("endAt", "==", noneTimestamp)), {
      fromServer: true,
    });
    const readingLog = runningLogs.find((l) => l.text === "読書");
    expect(readingLog).toBeTruthy();
    expect(readingLog!.id).toBe("$reading-both1");

    // Node should be appended to 読書
    const treeNodesCol = getCollection(firestore, "lifeLogTreeNodes");
    const nodes = await getDocs(firestore, query(treeNodesCol, where("parentId", "==", "$reading-both1")), {
      fromServer: true,
    });
    expect(nodes).toHaveLength(2);

    const store = getStore();
    expect(store.state.panesLifeLogs.selectedLifeLogId).toBe("$reading-both1");
  });

  it("ends running 読書 when appending to existing ネットサーフィン", async ({ db, task }) => {
    history.replaceState(null, "", "/?title=Example&url=https://example.com");

    const { ready, getFirestore, getStore } = setupShareTest(task.id, db, async (firestore) => {
      const batch = writeBatch(firestore.firestore);
      const batchVersion = getCollection(firestore, "batchVersion");
      const lifeLogs = getCollection(firestore, "lifeLogs");
      const lifeLogTreeNodes = getCollection(firestore, "lifeLogTreeNodes");

      batch.set(doc(batchVersion, singletonDocumentId), {
        version: "__INITIAL__",
        prevVersion: "",
        createdAt: Timestamp.fromDate(baseTime),
        updatedAt: Timestamp.fromDate(baseTime),
      });

      batch.set(doc(lifeLogs, "$netsurf-both2"), {
        text: "ネットサーフィン",
        hasTreeNodes: true,
        startAt: Timestamp.fromDate(baseTime),
        endAt: noneTimestamp,
        createdAt: Timestamp.fromDate(baseTime),
        updatedAt: Timestamp.fromDate(baseTime),
      });

      batch.set(doc(lifeLogTreeNodes, "$nnode-both2"), {
        text: "existing surf node",
        lifeLogId: "$netsurf-both2",
        parentId: "$netsurf-both2",
        order: "a0",
        createdAt: Timestamp.fromDate(baseTime),
        updatedAt: Timestamp.fromDate(baseTime),
      });

      batch.set(doc(lifeLogs, "$reading-both2"), {
        text: "読書",
        hasTreeNodes: true,
        startAt: Timestamp.fromDate(baseTime),
        endAt: noneTimestamp,
        createdAt: Timestamp.fromDate(baseTime),
        updatedAt: Timestamp.fromDate(baseTime),
      });

      await batch.commit();
    });

    await ready;
    await awaitPendingCallbacks();

    await waitFor(() => {
      expect(window.location.search).toBe("");
    });

    const firestore = getFirestore();
    const lifeLogsCol = getCollection(firestore, "lifeLogs");

    // 読書 should be ended
    const allLogs = await getDocs(firestore, query(lifeLogsCol, where("text", "==", "読書")), { fromServer: true });
    const endedLog = allLogs.find((l) => l.id === "$reading-both2");
    expect(endedLog).toBeTruthy();
    expect(endedLog!.endAt.toMillis()).toBe(Timestamp.fromDate(baseTime).toMillis());

    // ネットサーフィン should still be running
    const runningLogs = await getDocs(firestore, query(lifeLogsCol, where("endAt", "==", noneTimestamp)), {
      fromServer: true,
    });
    const netSurfLog = runningLogs.find((l) => l.text === "ネットサーフィン");
    expect(netSurfLog).toBeTruthy();
    expect(netSurfLog!.id).toBe("$netsurf-both2");

    // Node should be appended to ネットサーフィン
    const treeNodesCol = getCollection(firestore, "lifeLogTreeNodes");
    const nodes = await getDocs(firestore, query(treeNodesCol, where("parentId", "==", "$netsurf-both2")), {
      fromServer: true,
    });
    expect(nodes).toHaveLength(2);

    const store = getStore();
    expect(store.state.panesLifeLogs.selectedLifeLogId).toBe("$netsurf-both2");
  });

  it("uses most recent endAt as startAt when nothing is running", async ({ db, task }) => {
    history.replaceState(null, "", "/?title=Example&url=https://example.com");

    const pastEndAt = Timestamp.fromDate(new Date(2026, 0, 10, 11, 30, 0, 0));

    const { ready, getFirestore } = setupShareTest(task.id, db, async (firestore) => {
      const batch = writeBatch(firestore.firestore);
      const batchVersion = getCollection(firestore, "batchVersion");
      const lifeLogs = getCollection(firestore, "lifeLogs");

      batch.set(doc(batchVersion, singletonDocumentId), {
        version: "__INITIAL__",
        prevVersion: "",
        createdAt: Timestamp.fromDate(baseTime),
        updatedAt: Timestamp.fromDate(baseTime),
      });

      batch.set(doc(lifeLogs, "$finished1"), {
        text: "仕事",
        hasTreeNodes: false,
        startAt: Timestamp.fromDate(new Date(2026, 0, 10, 11, 0, 0, 0)),
        endAt: pastEndAt,
        createdAt: Timestamp.fromDate(baseTime),
        updatedAt: Timestamp.fromDate(baseTime),
      });

      await batch.commit();
    });

    await ready;
    await awaitPendingCallbacks();

    await waitFor(() => {
      expect(window.location.search).toBe("");
    });

    const firestore = getFirestore();
    const lifeLogsCol = getCollection(firestore, "lifeLogs");
    const runningLogs = await getDocs(firestore, query(lifeLogsCol, where("endAt", "==", noneTimestamp)), {
      fromServer: true,
    });
    const netSurfLog = runningLogs.find((l) => l.text === "ネットサーフィン");
    expect(netSurfLog).toBeTruthy();
    expect(netSurfLog!.startAt.toMillis()).toBe(pastEndAt.toMillis());
  });

  it("uses current time as startAt when other lifeLog is running", async ({ db, task }) => {
    history.replaceState(null, "", "/?title=Example&url=https://example.com");

    const { ready, getFirestore } = setupShareTest(task.id, db, async (firestore) => {
      const batch = writeBatch(firestore.firestore);
      const batchVersion = getCollection(firestore, "batchVersion");
      const lifeLogs = getCollection(firestore, "lifeLogs");

      batch.set(doc(batchVersion, singletonDocumentId), {
        version: "__INITIAL__",
        prevVersion: "",
        createdAt: Timestamp.fromDate(baseTime),
        updatedAt: Timestamp.fromDate(baseTime),
      });

      batch.set(doc(lifeLogs, "$running-other"), {
        text: "仕事",
        hasTreeNodes: false,
        startAt: Timestamp.fromDate(new Date(2026, 0, 10, 11, 0, 0, 0)),
        endAt: noneTimestamp,
        createdAt: Timestamp.fromDate(baseTime),
        updatedAt: Timestamp.fromDate(baseTime),
      });

      await batch.commit();
    });

    await ready;
    await awaitPendingCallbacks();

    await waitFor(() => {
      expect(window.location.search).toBe("");
    });

    const firestore = getFirestore();
    const lifeLogsCol = getCollection(firestore, "lifeLogs");
    const runningLogs = await getDocs(firestore, query(lifeLogsCol, where("endAt", "==", noneTimestamp)), {
      fromServer: true,
    });
    const netSurfLog = runningLogs.find((l) => l.text === "ネットサーフィン");
    expect(netSurfLog).toBeTruthy();
    expect(netSurfLog!.startAt.toMillis()).toBe(Timestamp.fromDate(baseTime).toMillis());
  });

  it("does nothing when no valid URL is present", async ({ db, task }) => {
    history.replaceState(null, "", "/?title=Example&text=no+url+here");

    const { ready, getFirestore } = setupShareTest(task.id, db, async (firestore) => {
      const batch = writeBatch(firestore.firestore);
      const batchVersion = getCollection(firestore, "batchVersion");

      batch.set(doc(batchVersion, singletonDocumentId), {
        version: "__INITIAL__",
        prevVersion: "",
        createdAt: Timestamp.fromDate(baseTime),
        updatedAt: Timestamp.fromDate(baseTime),
      });

      await batch.commit();
    });

    await ready;
    await awaitPendingCallbacks();

    const firestore = getFirestore();
    const lifeLogsCol = getCollection(firestore, "lifeLogs");
    const logs = await getDocs(firestore, query(lifeLogsCol, where("endAt", "==", noneTimestamp)), {
      fromServer: true,
    });
    expect(logs).toHaveLength(0);

    const treeNodesCol = getCollection(firestore, "lifeLogTreeNodes");
    const nodes = await getDocs(firestore, query(treeNodesCol, where("lifeLogId", "!=", "")), { fromServer: true });
    expect(nodes).toHaveLength(0);
  });

  it("uses OGP title when share title is not provided", async ({ db, task }) => {
    history.replaceState(null, "", "/?url=https://example.com");
    vi.mocked(fetchOGPMeta).mockResolvedValueOnce({ title: "OGP Title", description: null });

    const { ready, getFirestore } = setupShareTest(task.id, db, async (firestore) => {
      const batch = writeBatch(firestore.firestore);
      const batchVersion = getCollection(firestore, "batchVersion");

      batch.set(doc(batchVersion, singletonDocumentId), {
        version: "__INITIAL__",
        prevVersion: "",
        createdAt: Timestamp.fromDate(baseTime),
        updatedAt: Timestamp.fromDate(baseTime),
      });

      await batch.commit();
    });

    await ready;
    await awaitPendingCallbacks();

    await waitFor(() => {
      expect(window.location.search).toBe("");
    });

    const firestore = getFirestore();
    const treeNodesCol = getCollection(firestore, "lifeLogTreeNodes");
    const allNodes = await getDocs(firestore, query(treeNodesCol, where("lifeLogId", "!=", "")), { fromServer: true });
    expect(allNodes).toHaveLength(1);
    expect(allNodes[0].text).toBe("[OGP Title](https://example.com)");
  });

  it("falls back to URL when OGP returns null", async ({ db, task }) => {
    history.replaceState(null, "", "/?url=https://example.com");

    const { ready, getFirestore } = setupShareTest(task.id, db, async (firestore) => {
      const batch = writeBatch(firestore.firestore);
      const batchVersion = getCollection(firestore, "batchVersion");

      batch.set(doc(batchVersion, singletonDocumentId), {
        version: "__INITIAL__",
        prevVersion: "",
        createdAt: Timestamp.fromDate(baseTime),
        updatedAt: Timestamp.fromDate(baseTime),
      });

      await batch.commit();
    });

    await ready;
    await awaitPendingCallbacks();

    await waitFor(() => {
      expect(window.location.search).toBe("");
    });

    const firestore = getFirestore();
    const treeNodesCol = getCollection(firestore, "lifeLogTreeNodes");
    const allNodes = await getDocs(firestore, query(treeNodesCol, where("lifeLogId", "!=", "")), { fromServer: true });
    expect(allNodes).toHaveLength(1);
    expect(allNodes[0].text).toBe("[https://example.com](https://example.com)");
  });

  it("falls back to URL when OGP fetch rejects", async ({ db, task }) => {
    history.replaceState(null, "", "/?url=https://example.com");
    vi.mocked(fetchOGPMeta).mockRejectedValueOnce(new Error("network"));

    const { ready, getFirestore } = setupShareTest(task.id, db, async (firestore) => {
      const batch = writeBatch(firestore.firestore);
      const batchVersion = getCollection(firestore, "batchVersion");

      batch.set(doc(batchVersion, singletonDocumentId), {
        version: "__INITIAL__",
        prevVersion: "",
        createdAt: Timestamp.fromDate(baseTime),
        updatedAt: Timestamp.fromDate(baseTime),
      });

      await batch.commit();
    });

    await ready;
    await awaitPendingCallbacks();

    await waitFor(() => {
      expect(window.location.search).toBe("");
    });

    const firestore = getFirestore();
    const treeNodesCol = getCollection(firestore, "lifeLogTreeNodes");
    const allNodes = await getDocs(firestore, query(treeNodesCol, where("lifeLogId", "!=", "")), { fromServer: true });
    expect(allNodes).toHaveLength(1);
    expect(allNodes[0].text).toBe("[https://example.com](https://example.com)");
  });

  it("combines og:title and og:description for X URL", async ({ db, task }) => {
    const xUrl = "https://x.com/claudeai/status/2044785261393977612";
    history.replaceState(null, "", `/?url=${encodeURIComponent(xUrl)}`);
    vi.mocked(fetchOGPMeta).mockResolvedValueOnce({
      title: "XユーザーのClaude（@claudeai）さん",
      description: "Hello world",
    });

    const { ready, getFirestore } = setupShareTest(task.id, db, async (firestore) => {
      const batch = writeBatch(firestore.firestore);
      const batchVersion = getCollection(firestore, "batchVersion");

      batch.set(doc(batchVersion, singletonDocumentId), {
        version: "__INITIAL__",
        prevVersion: "",
        createdAt: Timestamp.fromDate(baseTime),
        updatedAt: Timestamp.fromDate(baseTime),
      });

      await batch.commit();
    });

    await ready;
    await awaitPendingCallbacks();

    await waitFor(() => {
      expect(window.location.search).toBe("");
    });

    const firestore = getFirestore();
    const treeNodesCol = getCollection(firestore, "lifeLogTreeNodes");
    const allNodes = await getDocs(firestore, query(treeNodesCol, where("lifeLogId", "!=", "")), { fromServer: true });
    expect(allNodes).toHaveLength(1);
    expect(allNodes[0].text).toBe(`[XユーザーのClaude（@claudeai）さん: Hello world](${xUrl})`);
  });

  it("uses og:title alone for X URL when og:description is missing", async ({ db, task }) => {
    const xUrl = "https://x.com/someone/status/1";
    history.replaceState(null, "", `/?url=${encodeURIComponent(xUrl)}`);
    vi.mocked(fetchOGPMeta).mockResolvedValueOnce({ title: "Just the title", description: null });

    const { ready, getFirestore } = setupShareTest(task.id, db, async (firestore) => {
      const batch = writeBatch(firestore.firestore);
      const batchVersion = getCollection(firestore, "batchVersion");

      batch.set(doc(batchVersion, singletonDocumentId), {
        version: "__INITIAL__",
        prevVersion: "",
        createdAt: Timestamp.fromDate(baseTime),
        updatedAt: Timestamp.fromDate(baseTime),
      });

      await batch.commit();
    });

    await ready;
    await awaitPendingCallbacks();

    await waitFor(() => {
      expect(window.location.search).toBe("");
    });

    const firestore = getFirestore();
    const treeNodesCol = getCollection(firestore, "lifeLogTreeNodes");
    const allNodes = await getDocs(firestore, query(treeNodesCol, where("lifeLogId", "!=", "")), { fromServer: true });
    expect(allNodes).toHaveLength(1);
    expect(allNodes[0].text).toBe(`[Just the title](${xUrl})`);
  });

  it("treats *.x.com subdomain as X", async ({ db, task }) => {
    const xUrl = "https://mobile.x.com/user/status/1";
    history.replaceState(null, "", `/?url=${encodeURIComponent(xUrl)}`);
    vi.mocked(fetchOGPMeta).mockResolvedValueOnce({ title: "T", description: "D" });

    const { ready, getFirestore } = setupShareTest(task.id, db, async (firestore) => {
      const batch = writeBatch(firestore.firestore);
      const batchVersion = getCollection(firestore, "batchVersion");

      batch.set(doc(batchVersion, singletonDocumentId), {
        version: "__INITIAL__",
        prevVersion: "",
        createdAt: Timestamp.fromDate(baseTime),
        updatedAt: Timestamp.fromDate(baseTime),
      });

      await batch.commit();
    });

    await ready;
    await awaitPendingCallbacks();

    await waitFor(() => {
      expect(window.location.search).toBe("");
    });

    const firestore = getFirestore();
    const treeNodesCol = getCollection(firestore, "lifeLogTreeNodes");
    const allNodes = await getDocs(firestore, query(treeNodesCol, where("lifeLogId", "!=", "")), { fromServer: true });
    expect(allNodes).toHaveLength(1);
    expect(allNodes[0].text).toBe(`[T: D](${xUrl})`);
  });

  it("ignores og:description for non-X URL even when present", async ({ db, task }) => {
    history.replaceState(null, "", "/?url=https://example.com");
    vi.mocked(fetchOGPMeta).mockResolvedValueOnce({ title: "Only Title", description: "Should be ignored" });

    const { ready, getFirestore } = setupShareTest(task.id, db, async (firestore) => {
      const batch = writeBatch(firestore.firestore);
      const batchVersion = getCollection(firestore, "batchVersion");

      batch.set(doc(batchVersion, singletonDocumentId), {
        version: "__INITIAL__",
        prevVersion: "",
        createdAt: Timestamp.fromDate(baseTime),
        updatedAt: Timestamp.fromDate(baseTime),
      });

      await batch.commit();
    });

    await ready;
    await awaitPendingCallbacks();

    await waitFor(() => {
      expect(window.location.search).toBe("");
    });

    const firestore = getFirestore();
    const treeNodesCol = getCollection(firestore, "lifeLogTreeNodes");
    const allNodes = await getDocs(firestore, query(treeNodesCol, where("lifeLogId", "!=", "")), { fromServer: true });
    expect(allNodes).toHaveLength(1);
    expect(allNodes[0].text).toBe("[Only Title](https://example.com)");
  });

  it("normalizes [ and ] in OGP title to full-width", async ({ db, task }) => {
    history.replaceState(null, "", "/?url=https://example.com");
    vi.mocked(fetchOGPMeta).mockResolvedValueOnce({ title: "[連載] My Article [第1話]", description: null });

    const { ready, getFirestore } = setupShareTest(task.id, db, async (firestore) => {
      const batch = writeBatch(firestore.firestore);
      const batchVersion = getCollection(firestore, "batchVersion");

      batch.set(doc(batchVersion, singletonDocumentId), {
        version: "__INITIAL__",
        prevVersion: "",
        createdAt: Timestamp.fromDate(baseTime),
        updatedAt: Timestamp.fromDate(baseTime),
      });

      await batch.commit();
    });

    await ready;
    await awaitPendingCallbacks();

    await waitFor(() => {
      expect(window.location.search).toBe("");
    });

    const firestore = getFirestore();
    const treeNodesCol = getCollection(firestore, "lifeLogTreeNodes");
    const allNodes = await getDocs(firestore, query(treeNodesCol, where("lifeLogId", "!=", "")), { fromServer: true });
    expect(allNodes).toHaveLength(1);
    expect(allNodes[0].text).toBe("[［連載］ My Article ［第1話］](https://example.com)");
  });

  it("normalizes [ and ] in user-provided title param", async ({ db, task }) => {
    history.replaceState(null, "", "/?title=%5B%E5%91%8A%E7%9F%A5%5D&url=https://example.com");

    const { ready, getFirestore } = setupShareTest(task.id, db, async (firestore) => {
      const batch = writeBatch(firestore.firestore);
      const batchVersion = getCollection(firestore, "batchVersion");

      batch.set(doc(batchVersion, singletonDocumentId), {
        version: "__INITIAL__",
        prevVersion: "",
        createdAt: Timestamp.fromDate(baseTime),
        updatedAt: Timestamp.fromDate(baseTime),
      });

      await batch.commit();
    });

    await ready;
    await awaitPendingCallbacks();

    await waitFor(() => {
      expect(window.location.search).toBe("");
    });

    const firestore = getFirestore();
    const treeNodesCol = getCollection(firestore, "lifeLogTreeNodes");
    const allNodes = await getDocs(firestore, query(treeNodesCol, where("lifeLogId", "!=", "")), { fromServer: true });
    expect(allNodes).toHaveLength(1);
    expect(allNodes[0].text).toBe("[［告知］](https://example.com)");
  });

  it("normalizes [ and ] in both halves of X combined label", async ({ db, task }) => {
    const xUrl = "https://x.com/user/status/1";
    history.replaceState(null, "", `/?url=${encodeURIComponent(xUrl)}`);
    vi.mocked(fetchOGPMeta).mockResolvedValueOnce({
      title: "Title[with]brackets",
      description: "Desc[also]brackets",
    });

    const { ready, getFirestore } = setupShareTest(task.id, db, async (firestore) => {
      const batch = writeBatch(firestore.firestore);
      const batchVersion = getCollection(firestore, "batchVersion");

      batch.set(doc(batchVersion, singletonDocumentId), {
        version: "__INITIAL__",
        prevVersion: "",
        createdAt: Timestamp.fromDate(baseTime),
        updatedAt: Timestamp.fromDate(baseTime),
      });

      await batch.commit();
    });

    await ready;
    await awaitPendingCallbacks();

    await waitFor(() => {
      expect(window.location.search).toBe("");
    });

    const firestore = getFirestore();
    const treeNodesCol = getCollection(firestore, "lifeLogTreeNodes");
    const allNodes = await getDocs(firestore, query(treeNodesCol, where("lifeLogId", "!=", "")), { fromServer: true });
    expect(allNodes).toHaveLength(1);
    expect(allNodes[0].text).toBe(`[Title［with］brackets: Desc［also］brackets](${xUrl})`);
  });

  it("does not add duplicate when same URL already exists in running lifeLog", async ({ db, task }) => {
    history.replaceState(null, "", "/?title=Example&url=https://example.com");

    const { ready, getFirestore, getStore } = setupShareTest(task.id, db, async (firestore) => {
      const batch = writeBatch(firestore.firestore);
      const batchVersion = getCollection(firestore, "batchVersion");
      const lifeLogs = getCollection(firestore, "lifeLogs");
      const lifeLogTreeNodes = getCollection(firestore, "lifeLogTreeNodes");

      batch.set(doc(batchVersion, singletonDocumentId), {
        version: "__INITIAL__",
        prevVersion: "",
        createdAt: Timestamp.fromDate(baseTime),
        updatedAt: Timestamp.fromDate(baseTime),
      });

      batch.set(doc(lifeLogs, "$netsurf-dup1"), {
        text: "ネットサーフィン",
        hasTreeNodes: true,
        startAt: Timestamp.fromDate(baseTime),
        endAt: noneTimestamp,
        createdAt: Timestamp.fromDate(baseTime),
        updatedAt: Timestamp.fromDate(baseTime),
      });

      batch.set(doc(lifeLogTreeNodes, "$node-dup1"), {
        text: "[Example](https://example.com)",
        lifeLogId: "$netsurf-dup1",
        parentId: "$netsurf-dup1",
        order: "a0",
        createdAt: Timestamp.fromDate(baseTime),
        updatedAt: Timestamp.fromDate(baseTime),
      });

      await batch.commit();
    });

    await ready;
    await awaitPendingCallbacks();

    await waitFor(() => {
      expect(window.location.search).toBe("");
    });

    const firestore = getFirestore();
    const treeNodesCol = getCollection(firestore, "lifeLogTreeNodes");
    const nodes = await getDocs(firestore, query(treeNodesCol, where("parentId", "==", "$netsurf-dup1")), {
      fromServer: true,
    });

    // Should still have only 1 node (no duplicate added)
    expect(nodes).toHaveLength(1);
    expect(nodes[0].text).toBe("[Example](https://example.com)");

    const store = getStore();
    expect(store.state.panesLifeLogs.selectedLifeLogId).toBe("$netsurf-dup1");
    expect(store.state.panesLifeLogs.selectedLifeLogNodeId).toBe("$node-dup1");
  });

  it("detects duplicate by URL even when title differs", async ({ db, task }) => {
    history.replaceState(null, "", "/?title=New+Title&url=https://example.com");

    const { ready, getFirestore, getStore } = setupShareTest(task.id, db, async (firestore) => {
      const batch = writeBatch(firestore.firestore);
      const batchVersion = getCollection(firestore, "batchVersion");
      const lifeLogs = getCollection(firestore, "lifeLogs");
      const lifeLogTreeNodes = getCollection(firestore, "lifeLogTreeNodes");

      batch.set(doc(batchVersion, singletonDocumentId), {
        version: "__INITIAL__",
        prevVersion: "",
        createdAt: Timestamp.fromDate(baseTime),
        updatedAt: Timestamp.fromDate(baseTime),
      });

      batch.set(doc(lifeLogs, "$netsurf-dup2"), {
        text: "ネットサーフィン",
        hasTreeNodes: true,
        startAt: Timestamp.fromDate(baseTime),
        endAt: noneTimestamp,
        createdAt: Timestamp.fromDate(baseTime),
        updatedAt: Timestamp.fromDate(baseTime),
      });

      batch.set(doc(lifeLogTreeNodes, "$node-dup2"), {
        text: "[Old Title](https://example.com)",
        lifeLogId: "$netsurf-dup2",
        parentId: "$netsurf-dup2",
        order: "a0",
        createdAt: Timestamp.fromDate(baseTime),
        updatedAt: Timestamp.fromDate(baseTime),
      });

      await batch.commit();
    });

    await ready;
    await awaitPendingCallbacks();

    await waitFor(() => {
      expect(window.location.search).toBe("");
    });

    const firestore = getFirestore();
    const treeNodesCol = getCollection(firestore, "lifeLogTreeNodes");
    const nodes = await getDocs(firestore, query(treeNodesCol, where("parentId", "==", "$netsurf-dup2")), {
      fromServer: true,
    });

    // Should still have only 1 node (no duplicate added)
    expect(nodes).toHaveLength(1);
    expect(nodes[0].text).toBe("[Old Title](https://example.com)");

    const store = getStore();
    expect(store.state.panesLifeLogs.selectedLifeLogId).toBe("$netsurf-dup2");
    expect(store.state.panesLifeLogs.selectedLifeLogNodeId).toBe("$node-dup2");
  });

  it("adds only after confirming a previous share found by ngram", async ({ db, task }) => {
    history.replaceState(null, "", "/?title=New+Example&url=https://example.com/past");

    const { ready, result, getFirestore, getStore } = setupShareComponentTest(task.id, db, async (firestore) => {
      const batch = writeBatch(firestore.firestore);
      const batchVersion = getCollection(firestore, "batchVersion");
      const lifeLogs = getCollection(firestore, "lifeLogs");
      const lifeLogTreeNodes = getCollection(firestore, "lifeLogTreeNodes");

      batch.set(doc(batchVersion, singletonDocumentId), {
        version: "__INITIAL__",
        prevVersion: "",
        createdAt: Timestamp.fromDate(baseTime),
        updatedAt: Timestamp.fromDate(baseTime),
      });

      batch.set(doc(lifeLogs, "$netsurf-current-confirm"), {
        text: "ネットサーフィン",
        hasTreeNodes: true,
        startAt: Timestamp.fromDate(baseTime),
        endAt: noneTimestamp,
        createdAt: Timestamp.fromDate(baseTime),
        updatedAt: Timestamp.fromDate(baseTime),
      });

      batch.set(doc(lifeLogTreeNodes, "$node-current-confirm"), {
        text: "current node",
        lifeLogId: "$netsurf-current-confirm",
        parentId: "$netsurf-current-confirm",
        order: "a0",
        createdAt: Timestamp.fromDate(baseTime),
        updatedAt: Timestamp.fromDate(baseTime),
      });

      batch.set(doc(lifeLogs, "$netsurf-past-confirm"), {
        text: "ネットサーフィン",
        hasTreeNodes: true,
        startAt: Timestamp.fromDate(new Date(2026, 0, 1, 10, 0, 0, 0)),
        endAt: Timestamp.fromDate(new Date(2026, 0, 1, 11, 0, 0, 0)),
        createdAt: Timestamp.fromDate(baseTime),
        updatedAt: Timestamp.fromDate(baseTime),
      });

      const pastNodeText = "[Old Example](https://example.com/past)";
      batch.set(doc(lifeLogTreeNodes, "$node-past-confirm"), {
        text: pastNodeText,
        lifeLogId: "$netsurf-past-confirm",
        parentId: "$netsurf-past-confirm",
        order: "a0",
        createdAt: Timestamp.fromDate(baseTime),
        updatedAt: Timestamp.fromDate(baseTime),
      });
      setNgramDoc(batch, firestore, "$node-past-confirm", "lifeLogTreeNodes", pastNodeText);

      await batch.commit();
    });

    await ready;
    expect(await result.findByRole("dialog", { name: "共有済みURLの確認" })).toBeTruthy();

    const firestore = getFirestore();
    const treeNodesCol = getCollection(firestore, "lifeLogTreeNodes");
    const currentNodesBefore = await getDocs(
      firestore,
      query(treeNodesCol, where("parentId", "==", "$netsurf-current-confirm")),
      { fromServer: true },
    );
    expect(currentNodesBefore).toHaveLength(1);

    await userEvent.click(result.getByText("追加する"));

    await waitFor(() => {
      expect(window.location.search).toBe("");
    });
    await waitFor(() => {
      expect(result.queryByText("app-content")).not.toBeNull();
    });

    const currentNodesAfter = await getDocs(
      firestore,
      query(treeNodesCol, where("parentId", "==", "$netsurf-current-confirm")),
      { fromServer: true },
    );
    expect(currentNodesAfter).toHaveLength(2);
    const newNode = currentNodesAfter.find((node) => node.text === "[New Example](https://example.com/past)");
    expect(newNode).toBeTruthy();

    const store = getStore();
    expect(store.state.panesLifeLogs.selectedLifeLogId).toBe("$netsurf-current-confirm");
    expect(store.state.panesLifeLogs.selectedLifeLogNodeId).toBe(newNode!.id);
  });

  it("does not add when the past-share confirmation is canceled", async ({ db, task }) => {
    history.replaceState(null, "", "/?title=New+Example&url=https://example.com/cancel");

    const { ready, result, getFirestore } = setupShareComponentTest(task.id, db, async (firestore) => {
      const batch = writeBatch(firestore.firestore);
      const batchVersion = getCollection(firestore, "batchVersion");
      const lifeLogs = getCollection(firestore, "lifeLogs");
      const lifeLogTreeNodes = getCollection(firestore, "lifeLogTreeNodes");

      batch.set(doc(batchVersion, singletonDocumentId), {
        version: "__INITIAL__",
        prevVersion: "",
        createdAt: Timestamp.fromDate(baseTime),
        updatedAt: Timestamp.fromDate(baseTime),
      });

      batch.set(doc(lifeLogs, "$netsurf-current-cancel"), {
        text: "ネットサーフィン",
        hasTreeNodes: true,
        startAt: Timestamp.fromDate(baseTime),
        endAt: noneTimestamp,
        createdAt: Timestamp.fromDate(baseTime),
        updatedAt: Timestamp.fromDate(baseTime),
      });

      batch.set(doc(lifeLogTreeNodes, "$node-current-cancel"), {
        text: "current node",
        lifeLogId: "$netsurf-current-cancel",
        parentId: "$netsurf-current-cancel",
        order: "a0",
        createdAt: Timestamp.fromDate(baseTime),
        updatedAt: Timestamp.fromDate(baseTime),
      });

      const pastNodeText = "[Old Example](https://example.com/cancel)";
      batch.set(doc(lifeLogTreeNodes, "$node-past-cancel"), {
        text: pastNodeText,
        lifeLogId: "$netsurf-past-cancel",
        parentId: "$netsurf-past-cancel",
        order: "a0",
        createdAt: Timestamp.fromDate(baseTime),
        updatedAt: Timestamp.fromDate(baseTime),
      });
      setNgramDoc(batch, firestore, "$node-past-cancel", "lifeLogTreeNodes", pastNodeText);

      await batch.commit();
    });

    await ready;
    expect(await result.findByRole("dialog", { name: "共有済みURLの確認" })).toBeTruthy();

    await userEvent.click(result.getByText("キャンセル"));

    await waitFor(() => {
      expect(window.location.search).toBe("");
    });
    await waitFor(() => {
      expect(result.queryByText("app-content")).not.toBeNull();
    });

    const firestore = getFirestore();
    const treeNodesCol = getCollection(firestore, "lifeLogTreeNodes");
    const currentNodes = await getDocs(
      firestore,
      query(treeNodesCol, where("parentId", "==", "$netsurf-current-cancel")),
      { fromServer: true },
    );
    expect(currentNodes).toHaveLength(1);
    expect(currentNodes[0].text).toBe("current node");
  });

  it("does not add when the past-share confirmation is closed with Escape", async ({ db, task }) => {
    history.replaceState(null, "", "/?title=New+Example&url=https://example.com/escape");

    const { ready, result, getFirestore } = setupShareComponentTest(task.id, db, async (firestore) => {
      const batch = writeBatch(firestore.firestore);
      const batchVersion = getCollection(firestore, "batchVersion");
      const lifeLogs = getCollection(firestore, "lifeLogs");
      const lifeLogTreeNodes = getCollection(firestore, "lifeLogTreeNodes");

      batch.set(doc(batchVersion, singletonDocumentId), {
        version: "__INITIAL__",
        prevVersion: "",
        createdAt: Timestamp.fromDate(baseTime),
        updatedAt: Timestamp.fromDate(baseTime),
      });

      batch.set(doc(lifeLogs, "$netsurf-current-escape"), {
        text: "ネットサーフィン",
        hasTreeNodes: true,
        startAt: Timestamp.fromDate(baseTime),
        endAt: noneTimestamp,
        createdAt: Timestamp.fromDate(baseTime),
        updatedAt: Timestamp.fromDate(baseTime),
      });

      batch.set(doc(lifeLogTreeNodes, "$node-current-escape"), {
        text: "current node",
        lifeLogId: "$netsurf-current-escape",
        parentId: "$netsurf-current-escape",
        order: "a0",
        createdAt: Timestamp.fromDate(baseTime),
        updatedAt: Timestamp.fromDate(baseTime),
      });

      const pastNodeText = "[Old Example](https://example.com/escape)";
      batch.set(doc(lifeLogTreeNodes, "$node-past-escape"), {
        text: pastNodeText,
        lifeLogId: "$netsurf-past-escape",
        parentId: "$netsurf-past-escape",
        order: "a0",
        createdAt: Timestamp.fromDate(baseTime),
        updatedAt: Timestamp.fromDate(baseTime),
      });
      setNgramDoc(batch, firestore, "$node-past-escape", "lifeLogTreeNodes", pastNodeText);

      await batch.commit();
    });

    await ready;
    expect(await result.findByRole("dialog", { name: "共有済みURLの確認" })).toBeTruthy();
    const cancelButton = result.getByText("キャンセル");
    await waitFor(() => {
      expect(document.activeElement).toBe(cancelButton);
    });

    await userEvent.keyboard("{Escape}");

    await waitFor(() => {
      expect(window.location.search).toBe("");
    });
    await waitFor(() => {
      expect(result.queryByText("app-content")).not.toBeNull();
    });

    const firestore = getFirestore();
    const treeNodesCol = getCollection(firestore, "lifeLogTreeNodes");
    const currentNodes = await getDocs(
      firestore,
      query(treeNodesCol, where("parentId", "==", "$netsurf-current-escape")),
      { fromServer: true },
    );
    expect(currentNodes).toHaveLength(1);
    expect(currentNodes[0].text).toBe("current node");
  });

  it("ignores ngram candidates when the URL does not match exactly", async ({ db, task }) => {
    history.replaceState(null, "", "/?title=New+Example&url=https://example.com/new");

    const { ready, getFirestore, getShareResult } = setupShareTest(task.id, db, async (firestore) => {
      const batch = writeBatch(firestore.firestore);
      const batchVersion = getCollection(firestore, "batchVersion");
      const lifeLogs = getCollection(firestore, "lifeLogs");
      const lifeLogTreeNodes = getCollection(firestore, "lifeLogTreeNodes");

      batch.set(doc(batchVersion, singletonDocumentId), {
        version: "__INITIAL__",
        prevVersion: "",
        createdAt: Timestamp.fromDate(baseTime),
        updatedAt: Timestamp.fromDate(baseTime),
      });

      batch.set(doc(lifeLogs, "$netsurf-current-similar"), {
        text: "ネットサーフィン",
        hasTreeNodes: true,
        startAt: Timestamp.fromDate(baseTime),
        endAt: noneTimestamp,
        createdAt: Timestamp.fromDate(baseTime),
        updatedAt: Timestamp.fromDate(baseTime),
      });

      batch.set(doc(lifeLogTreeNodes, "$node-current-similar"), {
        text: "current node",
        lifeLogId: "$netsurf-current-similar",
        parentId: "$netsurf-current-similar",
        order: "a0",
        createdAt: Timestamp.fromDate(baseTime),
        updatedAt: Timestamp.fromDate(baseTime),
      });

      const similarNodeText = "[Old Example](https://example.com/old)";
      batch.set(doc(lifeLogTreeNodes, "$node-past-similar"), {
        text: similarNodeText,
        lifeLogId: "$netsurf-past-similar",
        parentId: "$netsurf-past-similar",
        order: "a0",
        createdAt: Timestamp.fromDate(baseTime),
        updatedAt: Timestamp.fromDate(baseTime),
      });
      setNgramDoc(batch, firestore, "$node-past-similar", "lifeLogTreeNodes", similarNodeText);

      await batch.commit();
    });

    await ready;
    await awaitPendingCallbacks();

    expect(getShareResult()?.status).toBe("added");

    const firestore = getFirestore();
    const treeNodesCol = getCollection(firestore, "lifeLogTreeNodes");
    const currentNodes = await getDocs(
      firestore,
      query(treeNodesCol, where("parentId", "==", "$netsurf-current-similar")),
      { fromServer: true },
    );
    expect(currentNodes).toHaveLength(2);
    expect(currentNodes.some((node) => node.text === "[New Example](https://example.com/new)")).toBe(true);
  });

  it("does not end otherLog when duplicate URL detected", async ({ db, task }) => {
    history.replaceState(null, "", "/?title=Novel&url=https://ncode.syosetu.com/n1234ab/");

    const { ready, getFirestore } = setupShareTest(task.id, db, async (firestore) => {
      const batch = writeBatch(firestore.firestore);
      const batchVersion = getCollection(firestore, "batchVersion");
      const lifeLogs = getCollection(firestore, "lifeLogs");
      const lifeLogTreeNodes = getCollection(firestore, "lifeLogTreeNodes");

      batch.set(doc(batchVersion, singletonDocumentId), {
        version: "__INITIAL__",
        prevVersion: "",
        createdAt: Timestamp.fromDate(baseTime),
        updatedAt: Timestamp.fromDate(baseTime),
      });

      batch.set(doc(lifeLogs, "$reading-dup3"), {
        text: "読書",
        hasTreeNodes: true,
        startAt: Timestamp.fromDate(baseTime),
        endAt: noneTimestamp,
        createdAt: Timestamp.fromDate(baseTime),
        updatedAt: Timestamp.fromDate(baseTime),
      });

      batch.set(doc(lifeLogTreeNodes, "$node-dup3"), {
        text: "[Novel](https://ncode.syosetu.com/n1234ab/)",
        lifeLogId: "$reading-dup3",
        parentId: "$reading-dup3",
        order: "a0",
        createdAt: Timestamp.fromDate(baseTime),
        updatedAt: Timestamp.fromDate(baseTime),
      });

      batch.set(doc(lifeLogs, "$netsurf-dup3"), {
        text: "ネットサーフィン",
        hasTreeNodes: true,
        startAt: Timestamp.fromDate(baseTime),
        endAt: noneTimestamp,
        createdAt: Timestamp.fromDate(baseTime),
        updatedAt: Timestamp.fromDate(baseTime),
      });

      await batch.commit();
    });

    await ready;
    await awaitPendingCallbacks();

    await waitFor(() => {
      expect(window.location.search).toBe("");
    });

    const firestore = getFirestore();
    const lifeLogsCol = getCollection(firestore, "lifeLogs");

    // ネットサーフィン should still be running (not ended)
    const netSurfLogs = await getDocs(firestore, query(lifeLogsCol, where("text", "==", "ネットサーフィン")), {
      fromServer: true,
    });
    const netSurfLog = netSurfLogs.find((l) => l.id === "$netsurf-dup3");
    expect(netSurfLog).toBeTruthy();
    expect(netSurfLog!.endAt).toEqual(noneTimestamp);

    // 読書 should still be running
    const readingLogs = await getDocs(firestore, query(lifeLogsCol, where("text", "==", "読書")), { fromServer: true });
    const readingLog = readingLogs.find((l) => l.id === "$reading-dup3");
    expect(readingLog).toBeTruthy();
    expect(readingLog!.endAt).toEqual(noneTimestamp);

    // No new tree nodes added
    const treeNodesCol = getCollection(firestore, "lifeLogTreeNodes");
    const nodes = await getDocs(firestore, query(treeNodesCol, where("lifeLogId", "==", "$reading-dup3")), {
      fromServer: true,
    });
    expect(nodes).toHaveLength(1);
  });
});
