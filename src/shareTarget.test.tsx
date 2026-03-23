import { cleanup, render, waitFor } from "@solidjs/testing-library";
import { doc, query, Timestamp, where, writeBatch } from "firebase/firestore";
import { onMount, Suspense } from "solid-js";
import { afterAll, afterEach, beforeAll, describe, expect, vi } from "vitest";

import { awaitPendingCallbacks } from "@/awaitableCallback";
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
import { StoreServiceProvider, useStoreService } from "@/services/store";
import { handleShareTarget } from "@/shareTarget";
import { acquireEmulator, releaseEmulator, testWithDb as it, type DatabaseInfo } from "@/test";
import { noneTimestamp } from "@/timestamp";

vi.mock(import("@/date"), async () => {
  return {
    NewDate: () => baseTime,
    DateNow: () => baseTime.getTime(),
    TimestampNow: () => Timestamp.fromDate(baseTime),
  };
});

beforeAll(async () => {
  await acquireEmulator();
});

afterAll(async () => {
  await releaseEmulator();
});

afterEach(async () => {
  await awaitPendingCallbacks();
  cleanup();
  history.replaceState(null, "", "/");
});

function setupShareHandlerTest(
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
              storeRef = useStoreService();

              onMount(() => {
                (async () => {
                  await setupData(firestore);
                  await handleShareTarget(firestore);
                })().then(resolveReady, rejectReady);
              });

              return <span>share-handler-mounted</span>;
            })()}
          </Suspense>
        </FirestoreServiceProvider>
      </FirebaseServiceProvider>
    </StoreServiceProvider>
  ));

  return { ready, result, getFirestore: () => firestoreRef, getStore: () => storeRef };
}

describe("handleShareTarget", () => {
  it("adds link to existing running ネットサーフィン with tree nodes", async ({ db, task }) => {
    history.replaceState(null, "", "/?title=Example&url=https://example.com");

    const { ready, getFirestore, getStore } = setupShareHandlerTest(task.id, db, async (firestore) => {
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
    const nodes = await getDocs(firestore, query(treeNodesCol, where("parentId", "==", "$netsurf1")));

    expect(nodes).toHaveLength(2);
    const newNode = nodes.find((n) => n.text === "[Example](https://example.com)");
    expect(newNode).toBeTruthy();
    expect(newNode!.order > "a0").toBe(true);

    const store = getStore();
    expect(store.state.panesLifeLogs.selectedLifeLogId).toBe("$netsurf1");
    expect(store.state.panesLifeLogs.selectedLifeLogNodeId).toBe(newNode!.id);
  });

  it("adds link to existing running ネットサーフィン without tree nodes", async ({ db, task }) => {
    history.replaceState(null, "", "/?title=Example&url=https://example.com");

    const { ready, getFirestore, getStore } = setupShareHandlerTest(task.id, db, async (firestore) => {
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
    const nodes = await getDocs(firestore, query(treeNodesCol, where("parentId", "==", "$netsurf2")));

    expect(nodes).toHaveLength(1);
    expect(nodes[0].text).toBe("[Example](https://example.com)");

    // Check hasTreeNodes was updated
    const lifeLogsCol = getCollection(firestore, "lifeLogs");
    const logs = await getDocs(firestore, query(lifeLogsCol, where("endAt", "==", noneTimestamp)));
    const netSurfLog = logs.find((l) => l.text === "ネットサーフィン");
    expect(netSurfLog!.hasTreeNodes).toBe(true);

    const store = getStore();
    expect(store.state.panesLifeLogs.selectedLifeLogId).toBe("$netsurf2");
    expect(store.state.panesLifeLogs.selectedLifeLogNodeId).toBe(nodes[0].id);
  });

  it("creates new ネットサーフィン lifeLog when none exists", async ({ db, task }) => {
    history.replaceState(null, "", "/?title=Example&url=https://example.com");

    const { ready, getFirestore, getStore } = setupShareHandlerTest(task.id, db, async (firestore) => {
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
    const logs = await getDocs(firestore, query(lifeLogsCol, where("endAt", "==", noneTimestamp)));
    const netSurfLog = logs.find((l) => l.text === "ネットサーフィン");
    expect(netSurfLog).toBeTruthy();
    expect(netSurfLog!.hasTreeNodes).toBe(true);
    expect(netSurfLog!.startAt.toMillis()).toBe(Timestamp.fromDate(baseTime).toMillis());

    // Check tree node was created
    const treeNodesCol = getCollection(firestore, "lifeLogTreeNodes");
    const nodes = await getDocs(firestore, query(treeNodesCol, where("parentId", "==", netSurfLog!.id)));
    expect(nodes).toHaveLength(1);
    expect(nodes[0].text).toBe("[Example](https://example.com)");

    const store = getStore();
    expect(store.state.panesLifeLogs.selectedLifeLogId).toBe(netSurfLog!.id);
    expect(store.state.panesLifeLogs.selectedLifeLogNodeId).toBe(nodes[0].id);
  });

  it("extracts URL from text parameter", async ({ db, task }) => {
    history.replaceState(null, "", "/?title=Example&text=https://example.com");

    const { ready, getFirestore, getStore } = setupShareHandlerTest(task.id, db, async (firestore) => {
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
    const allNodes = await getDocs(firestore, query(treeNodesCol, where("lifeLogId", "!=", "")));
    expect(allNodes).toHaveLength(1);
    expect(allNodes[0].text).toBe("[Example](https://example.com)");

    const store = getStore();
    const lifeLogsCol = getCollection(firestore, "lifeLogs");
    const logs = await getDocs(firestore, query(lifeLogsCol, where("endAt", "==", noneTimestamp)));
    const netSurfLog = logs.find((l) => l.text === "ネットサーフィン");
    expect(store.state.panesLifeLogs.selectedLifeLogId).toBe(netSurfLog!.id);
    expect(store.state.panesLifeLogs.selectedLifeLogNodeId).toBe(allNodes[0].id);
  });

  it("creates 読書 lifeLog for ncode.syosetu.com URL", async ({ db, task }) => {
    history.replaceState(null, "", "/?title=Novel&url=https://ncode.syosetu.com/n1234ab/");

    const { ready, getFirestore, getStore } = setupShareHandlerTest(task.id, db, async (firestore) => {
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
    const logs = await getDocs(firestore, query(lifeLogsCol, where("endAt", "==", noneTimestamp)));
    const readingLog = logs.find((l) => l.text === "読書");
    expect(readingLog).toBeTruthy();
    expect(readingLog!.hasTreeNodes).toBe(true);

    const treeNodesCol = getCollection(firestore, "lifeLogTreeNodes");
    const nodes = await getDocs(firestore, query(treeNodesCol, where("parentId", "==", readingLog!.id)));
    expect(nodes).toHaveLength(1);
    expect(nodes[0].text).toBe("[Novel](https://ncode.syosetu.com/n1234ab/)");

    const store = getStore();
    expect(store.state.panesLifeLogs.selectedLifeLogId).toBe(readingLog!.id);
    expect(store.state.panesLifeLogs.selectedLifeLogNodeId).toBe(nodes[0].id);
  });

  it("creates 読書 lifeLog for kakuyomu.jp URL", async ({ db, task }) => {
    history.replaceState(null, "", "/?title=Work&url=https://kakuyomu.jp/works/123");

    const { ready, getFirestore, getStore } = setupShareHandlerTest(task.id, db, async (firestore) => {
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
    const logs = await getDocs(firestore, query(lifeLogsCol, where("endAt", "==", noneTimestamp)));
    const readingLog = logs.find((l) => l.text === "読書");
    expect(readingLog).toBeTruthy();
    expect(readingLog!.hasTreeNodes).toBe(true);

    const treeNodesCol = getCollection(firestore, "lifeLogTreeNodes");
    const nodes = await getDocs(firestore, query(treeNodesCol, where("parentId", "==", readingLog!.id)));
    expect(nodes).toHaveLength(1);
    expect(nodes[0].text).toBe("[Work](https://kakuyomu.jp/works/123)");

    const store = getStore();
    expect(store.state.panesLifeLogs.selectedLifeLogId).toBe(readingLog!.id);
    expect(store.state.panesLifeLogs.selectedLifeLogNodeId).toBe(nodes[0].id);
  });

  it("appends to existing running 読書 for syosetu.org URL", async ({ db, task }) => {
    history.replaceState(null, "", "/?title=Novel&url=https://syosetu.org/novel/123/");

    const { ready, getFirestore, getStore } = setupShareHandlerTest(task.id, db, async (firestore) => {
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
    const nodes = await getDocs(firestore, query(treeNodesCol, where("parentId", "==", "$reading1")));

    expect(nodes).toHaveLength(2);
    const newNode = nodes.find((n) => n.text === "[Novel](https://syosetu.org/novel/123/)");
    expect(newNode).toBeTruthy();
    expect(newNode!.order > "a0").toBe(true);

    const store = getStore();
    expect(store.state.panesLifeLogs.selectedLifeLogId).toBe("$reading1");
    expect(store.state.panesLifeLogs.selectedLifeLogNodeId).toBe(newNode!.id);
  });

  it("ends running ネットサーフィン when creating new 読書", async ({ db, task }) => {
    history.replaceState(null, "", "/?title=Novel&url=https://ncode.syosetu.com/n1234ab/");

    const { ready, getFirestore, getStore } = setupShareHandlerTest(task.id, db, async (firestore) => {
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
    const allLogs = await getDocs(firestore, query(lifeLogsCol, where("text", "==", "ネットサーフィン")));
    const endedLog = allLogs.find((l) => l.id === "$netsurf-excl1");
    expect(endedLog).toBeTruthy();
    expect(endedLog!.endAt.toMillis()).toBe(Timestamp.fromDate(baseTime).toMillis());

    // New 読書 should be created with same startAt
    const runningLogs = await getDocs(firestore, query(lifeLogsCol, where("endAt", "==", noneTimestamp)));
    const readingLog = runningLogs.find((l) => l.text === "読書");
    expect(readingLog).toBeTruthy();
    expect(readingLog!.startAt.toMillis()).toBe(Timestamp.fromDate(baseTime).toMillis());

    const store = getStore();
    expect(store.state.panesLifeLogs.selectedLifeLogId).toBe(readingLog!.id);
  });

  it("ends running 読書 when creating new ネットサーフィン", async ({ db, task }) => {
    history.replaceState(null, "", "/?title=Example&url=https://example.com");

    const { ready, getFirestore, getStore } = setupShareHandlerTest(task.id, db, async (firestore) => {
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
    const allLogs = await getDocs(firestore, query(lifeLogsCol, where("text", "==", "読書")));
    const endedLog = allLogs.find((l) => l.id === "$reading-excl1");
    expect(endedLog).toBeTruthy();
    expect(endedLog!.endAt.toMillis()).toBe(Timestamp.fromDate(baseTime).toMillis());

    // New ネットサーフィン should be created with same startAt
    const runningLogs = await getDocs(firestore, query(lifeLogsCol, where("endAt", "==", noneTimestamp)));
    const netSurfLog = runningLogs.find((l) => l.text === "ネットサーフィン");
    expect(netSurfLog).toBeTruthy();
    expect(netSurfLog!.startAt.toMillis()).toBe(Timestamp.fromDate(baseTime).toMillis());

    const store = getStore();
    expect(store.state.panesLifeLogs.selectedLifeLogId).toBe(netSurfLog!.id);
  });

  it("ends running ネットサーフィン when appending to existing 読書", async ({ db, task }) => {
    history.replaceState(null, "", "/?title=Novel&url=https://ncode.syosetu.com/n1234ab/");

    const { ready, getFirestore, getStore } = setupShareHandlerTest(task.id, db, async (firestore) => {
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
    const allLogs = await getDocs(firestore, query(lifeLogsCol, where("text", "==", "ネットサーフィン")));
    const endedLog = allLogs.find((l) => l.id === "$netsurf-both1");
    expect(endedLog).toBeTruthy();
    expect(endedLog!.endAt.toMillis()).toBe(Timestamp.fromDate(baseTime).toMillis());

    // 読書 should still be running
    const runningLogs = await getDocs(firestore, query(lifeLogsCol, where("endAt", "==", noneTimestamp)));
    const readingLog = runningLogs.find((l) => l.text === "読書");
    expect(readingLog).toBeTruthy();
    expect(readingLog!.id).toBe("$reading-both1");

    // Node should be appended to 読書
    const treeNodesCol = getCollection(firestore, "lifeLogTreeNodes");
    const nodes = await getDocs(firestore, query(treeNodesCol, where("parentId", "==", "$reading-both1")));
    expect(nodes).toHaveLength(2);

    const store = getStore();
    expect(store.state.panesLifeLogs.selectedLifeLogId).toBe("$reading-both1");
  });

  it("ends running 読書 when appending to existing ネットサーフィン", async ({ db, task }) => {
    history.replaceState(null, "", "/?title=Example&url=https://example.com");

    const { ready, getFirestore, getStore } = setupShareHandlerTest(task.id, db, async (firestore) => {
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
    const allLogs = await getDocs(firestore, query(lifeLogsCol, where("text", "==", "読書")));
    const endedLog = allLogs.find((l) => l.id === "$reading-both2");
    expect(endedLog).toBeTruthy();
    expect(endedLog!.endAt.toMillis()).toBe(Timestamp.fromDate(baseTime).toMillis());

    // ネットサーフィン should still be running
    const runningLogs = await getDocs(firestore, query(lifeLogsCol, where("endAt", "==", noneTimestamp)));
    const netSurfLog = runningLogs.find((l) => l.text === "ネットサーフィン");
    expect(netSurfLog).toBeTruthy();
    expect(netSurfLog!.id).toBe("$netsurf-both2");

    // Node should be appended to ネットサーフィン
    const treeNodesCol = getCollection(firestore, "lifeLogTreeNodes");
    const nodes = await getDocs(firestore, query(treeNodesCol, where("parentId", "==", "$netsurf-both2")));
    expect(nodes).toHaveLength(2);

    const store = getStore();
    expect(store.state.panesLifeLogs.selectedLifeLogId).toBe("$netsurf-both2");
  });

  it("uses most recent endAt as startAt when nothing is running", async ({ db, task }) => {
    history.replaceState(null, "", "/?title=Example&url=https://example.com");

    const pastEndAt = Timestamp.fromDate(new Date(2026, 0, 10, 11, 30, 0, 0));

    const { ready, getFirestore } = setupShareHandlerTest(task.id, db, async (firestore) => {
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
    const runningLogs = await getDocs(firestore, query(lifeLogsCol, where("endAt", "==", noneTimestamp)));
    const netSurfLog = runningLogs.find((l) => l.text === "ネットサーフィン");
    expect(netSurfLog).toBeTruthy();
    expect(netSurfLog!.startAt.toMillis()).toBe(pastEndAt.toMillis());
  });

  it("uses current time as startAt when other lifeLog is running", async ({ db, task }) => {
    history.replaceState(null, "", "/?title=Example&url=https://example.com");

    const { ready, getFirestore } = setupShareHandlerTest(task.id, db, async (firestore) => {
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
    const runningLogs = await getDocs(firestore, query(lifeLogsCol, where("endAt", "==", noneTimestamp)));
    const netSurfLog = runningLogs.find((l) => l.text === "ネットサーフィン");
    expect(netSurfLog).toBeTruthy();
    expect(netSurfLog!.startAt.toMillis()).toBe(Timestamp.fromDate(baseTime).toMillis());
  });

  it("does nothing when no valid URL is present", async ({ db, task }) => {
    history.replaceState(null, "", "/?title=Example&text=no+url+here");

    const { ready, getFirestore } = setupShareHandlerTest(task.id, db, async (firestore) => {
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
    const logs = await getDocs(firestore, query(lifeLogsCol, where("endAt", "==", noneTimestamp)));
    expect(logs).toHaveLength(0);

    const treeNodesCol = getCollection(firestore, "lifeLogTreeNodes");
    const nodes = await getDocs(firestore, query(treeNodesCol, where("lifeLogId", "!=", "")));
    expect(nodes).toHaveLength(0);
  });
});
