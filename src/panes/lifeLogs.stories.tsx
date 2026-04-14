import { doc, Timestamp, writeBatch } from "firebase/firestore";
import { onMount, Show, Suspense, type JSXElement, createSignal } from "solid-js";
import { type Meta, type StoryObj } from "storybook-solidjs-vite";

import { WithEditHistoryPanel } from "@/components/editHistory";
import { LifeLogs } from "@/panes/lifeLogs";
import { Share } from "@/panes/share";
import { ActionsServiceProvider } from "@/services/actions";
import { FirebaseServiceProvider } from "@/services/firebase";
import {
  FirestoreServiceProvider,
  getCollection,
  singletonDocumentId,
  useFirestoreService,
} from "@/services/firebase/firestore";
import { runBatch } from "@/services/firebase/firestore/batch";
import { undo as undoEngine } from "@/services/firebase/firestore/editHistory";
import { StoreServiceProvider, useStoreService } from "@/services/store";
import { Toast } from "@/services/toast";
import { hourMs, noneTimestamp } from "@/timestamp";

export default {
  title: "panes/lifeLogs",
} satisfies Meta;

const firebaseConfig = `{ apiKey: "apiKey", authDomain: "authDomain", projectId: "demo", storageBucket: "", messagingSenderId: "", appId: "", measurementId: "", projectNumber: "", version: "2" }`;

function StorybookFirebaseWrapper(props: { children: JSXElement; showConfig?: boolean }) {
  const [configText, setConfigText] = createSignal(firebaseConfig);
  const [errors, setErrors] = createSignal<string[]>([]);

  return (
    <>
      <pre>{errors().join("\n")}</pre>
      <FirebaseServiceProvider configYAML={configText()} setErrors={setErrors} appName="LifeLogsStory">
        {props.showConfig !== false && (
          <>
            <div style={{ "margin-bottom": "20px" }}>
              <label style={{ display: "block", "margin-bottom": "5px" }}>Firebase Configuration:</label>
              <textarea
                value={configText()}
                onInput={(e) => setConfigText(e.currentTarget.value)}
                style={{
                  width: "100%",
                  height: "50px",
                  "font-family": "monospace",
                  padding: "8px",
                  border: "1px solid #ccc",
                  "border-radius": "4px",
                }}
              />
            </div>
          </>
        )}
        <FirestoreServiceProvider useMemoryCache>
          <ActionsServiceProvider>{props.children}</ActionsServiceProvider>
        </FirestoreServiceProvider>
      </FirebaseServiceProvider>
    </>
  );
}

export const LifeLogsStory: StoryObj = {
  render() {
    return (
      <StoreServiceProvider>
        <StorybookFirebaseWrapper>
          <Suspense fallback={<span>loading....</span>}>
            {(() => {
              const firestore = useFirestoreService();

              const batchVersion = getCollection(firestore, "batchVersion");
              const lifeLogs = getCollection(firestore, "lifeLogs");
              const lifeLogTreeNodes = getCollection(firestore, "lifeLogTreeNodes");

              const { updateState } = useStoreService();

              onMount(() => {
                (async () => {
                  await fetch("http://localhost:8080/emulator/v1/projects/demo/databases/(default)/documents", {
                    method: "DELETE",
                  });

                  const batch = writeBatch(firestore.firestore);

                  batch.set(doc(batchVersion, singletonDocumentId), {
                    version: "__INITIAL__",
                    prevVersion: "",
                    createdAt: Timestamp.fromDate(new Date()),
                    updatedAt: Timestamp.fromDate(new Date()),
                  });

                  batch.set(doc(lifeLogs, "$log1"), {
                    text: "lifelog1",
                    hasTreeNodes: true,
                    startAt: noneTimestamp,
                    endAt: noneTimestamp,
                    createdAt: Timestamp.fromDate(new Date()),
                    updatedAt: Timestamp.fromDate(new Date()),
                  });

                  batch.set(doc(lifeLogTreeNodes, "child1"), {
                    text: "child1",
                    lifeLogId: "$log1",
                    parentId: "$log1",
                    order: "a0",
                    createdAt: Timestamp.fromDate(new Date()),
                    updatedAt: Timestamp.fromDate(new Date()),
                  });

                  batch.set(doc(lifeLogTreeNodes, "child2"), {
                    text: "child2",
                    lifeLogId: "$log1",
                    parentId: "$log1",
                    order: "a1",
                    createdAt: Timestamp.fromDate(new Date()),
                    updatedAt: Timestamp.fromDate(new Date()),
                  });

                  batch.set(doc(lifeLogTreeNodes, "child3"), {
                    text: "child3",
                    lifeLogId: "$log1",
                    parentId: "$log1",
                    order: "a2",
                    createdAt: Timestamp.fromDate(new Date()),
                    updatedAt: Timestamp.fromDate(new Date()),
                  });

                  batch.set(doc(lifeLogTreeNodes, "child4"), {
                    text: "child4",
                    lifeLogId: "$log1",
                    parentId: "$log1",
                    order: "a3",
                    createdAt: Timestamp.fromDate(new Date()),
                    updatedAt: Timestamp.fromDate(new Date()),
                  });

                  batch.set(doc(lifeLogTreeNodes, "child5"), {
                    text: "child5",
                    lifeLogId: "$log1",
                    parentId: "$log1",
                    order: "a4",
                    createdAt: Timestamp.fromDate(new Date()),
                    updatedAt: Timestamp.fromDate(new Date()),
                  });

                  batch.set(doc(lifeLogTreeNodes, "child6"), {
                    text: "child6",
                    lifeLogId: "$log1",
                    parentId: "$log1",
                    order: "a5",
                    createdAt: Timestamp.fromDate(new Date()),
                    updatedAt: Timestamp.fromDate(new Date()),
                  });

                  batch.set(doc(lifeLogTreeNodes, "child1 of child1"), {
                    text: "child1 of child1",
                    lifeLogId: "$log1",
                    parentId: "child1",
                    order: "a0",
                    createdAt: Timestamp.fromDate(new Date()),
                    updatedAt: Timestamp.fromDate(new Date()),
                  });

                  await batch.commit();

                  updateState((state) => {
                    state.panesLifeLogs.selectedLifeLogId = "$log1";
                    state.panesLifeLogs.selectedLifeLogNodeId = "";
                  });
                })().catch((error: unknown) => {
                  console.error("Error initializing Firestore data:", error);
                });
              });

              return <LifeLogs />;
            })()}
          </Suspense>
        </StorybookFirebaseWrapper>
      </StoreServiceProvider>
    );
  },
};

function FullscreenSetup(props: { children?: JSXElement }) {
  const firestore = useFirestoreService();

  const batchVersion = getCollection(firestore, "batchVersion");
  const lifeLogs = getCollection(firestore, "lifeLogs");
  const lifeLogTreeNodes = getCollection(firestore, "lifeLogTreeNodes");

  const { updateState } = useStoreService();

  onMount(() => {
    (async () => {
      await fetch("http://localhost:8080/emulator/v1/projects/demo/databases/(default)/documents", {
        method: "DELETE",
      });

      const batch = writeBatch(firestore.firestore);

      batch.set(doc(batchVersion, singletonDocumentId), {
        version: "__INITIAL__",
        prevVersion: "",
        createdAt: Timestamp.fromDate(new Date()),
        updatedAt: Timestamp.fromDate(new Date()),
      });

      batch.set(doc(lifeLogs, "$log1"), {
        text: "lifelog1",
        hasTreeNodes: true,
        startAt: noneTimestamp,
        endAt: noneTimestamp,
        createdAt: Timestamp.fromDate(new Date()),
        updatedAt: Timestamp.fromDate(new Date()),
      });

      batch.set(doc(lifeLogTreeNodes, "child1"), {
        text: "child1",
        lifeLogId: "$log1",
        parentId: "$log1",
        order: "a0",
        createdAt: Timestamp.fromDate(new Date()),
        updatedAt: Timestamp.fromDate(new Date()),
      });

      batch.set(doc(lifeLogTreeNodes, "child2"), {
        text: "child2",
        lifeLogId: "$log1",
        parentId: "$log1",
        order: "a1",
        createdAt: Timestamp.fromDate(new Date()),
        updatedAt: Timestamp.fromDate(new Date()),
      });

      batch.set(doc(lifeLogTreeNodes, "child3"), {
        text: "child3",
        lifeLogId: "$log1",
        parentId: "$log1",
        order: "a2",
        createdAt: Timestamp.fromDate(new Date()),
        updatedAt: Timestamp.fromDate(new Date()),
      });

      batch.set(doc(lifeLogTreeNodes, "child4"), {
        text: "child4",
        lifeLogId: "$log1",
        parentId: "$log1",
        order: "a3",
        createdAt: Timestamp.fromDate(new Date()),
        updatedAt: Timestamp.fromDate(new Date()),
      });

      batch.set(doc(lifeLogTreeNodes, "child5"), {
        text: "child5",
        lifeLogId: "$log1",
        parentId: "$log1",
        order: "a4",
        createdAt: Timestamp.fromDate(new Date()),
        updatedAt: Timestamp.fromDate(new Date()),
      });

      batch.set(doc(lifeLogTreeNodes, "child6"), {
        text: "child6",
        lifeLogId: "$log1",
        parentId: "$log1",
        order: "a5",
        createdAt: Timestamp.fromDate(new Date()),
        updatedAt: Timestamp.fromDate(new Date()),
      });

      batch.set(doc(lifeLogTreeNodes, "child1 of child1"), {
        text: "child1 of child1",
        lifeLogId: "$log1",
        parentId: "child1",
        order: "a0",
        createdAt: Timestamp.fromDate(new Date()),
        updatedAt: Timestamp.fromDate(new Date()),
      });

      await batch.commit();

      updateState((state) => {
        state.panesLifeLogs.selectedLifeLogId = "$log1";
        state.panesLifeLogs.selectedLifeLogNodeId = "";
      });
    })().catch((error: unknown) => {
      console.error("Error initializing Firestore data:", error);
    });
  });

  return (
    <>
      {props.children}
      <div style={{ height: "100svh" }}>
        <WithEditHistoryPanel>
          <LifeLogs />
        </WithEditHistoryPanel>
      </div>
    </>
  );
}

export const LifeLogsFullscreen: StoryObj = {
  render() {
    return (
      <StoreServiceProvider>
        <StorybookFirebaseWrapper showConfig={false}>
          <Suspense fallback={<span>loading....</span>}>
            <FullscreenSetup />
          </Suspense>
        </StorybookFirebaseWrapper>
      </StoreServiceProvider>
    );
  },
};

function ShareStory() {
  const firestore = useFirestoreService();

  const batchVersion = getCollection(firestore, "batchVersion");
  const lifeLogs = getCollection(firestore, "lifeLogs");
  const lifeLogTreeNodes = getCollection(firestore, "lifeLogTreeNodes");

  const { state, updateState } = useStoreService();

  // Detect share params on load
  const params = new URLSearchParams(window.location.search);
  if (params.has("title") || params.has("url") || params.has("text")) {
    updateState((s) => {
      s.panesShare.isActive = true;
    });
  }

  const initialize = async () => {
    await fetch("http://localhost:8080/emulator/v1/projects/demo/databases/(default)/documents", {
      method: "DELETE",
    });

    const batch = writeBatch(firestore.firestore);

    batch.set(doc(batchVersion, singletonDocumentId), {
      version: "__INITIAL__",
      prevVersion: "",
      createdAt: Timestamp.fromDate(new Date()),
      updatedAt: Timestamp.fromDate(new Date()),
    });

    batch.set(doc(lifeLogs, "$log1"), {
      text: "lifelog1",
      hasTreeNodes: true,
      startAt: noneTimestamp,
      endAt: noneTimestamp,
      createdAt: Timestamp.fromDate(new Date()),
      updatedAt: Timestamp.fromDate(new Date()),
    });

    batch.set(doc(lifeLogTreeNodes, "child1"), {
      text: "child1",
      lifeLogId: "$log1",
      parentId: "$log1",
      order: "a0",
      createdAt: Timestamp.fromDate(new Date()),
      updatedAt: Timestamp.fromDate(new Date()),
    });

    await batch.commit();

    updateState((s) => {
      s.panesLifeLogs.selectedLifeLogId = "$log1";
      s.panesLifeLogs.selectedLifeLogNodeId = "";
    });
  };

  const openWithShare = () => {
    const url = new URL(window.location.href);
    url.searchParams.set("title", "Example");
    url.searchParams.set("url", "https://example.com");
    window.location.href = url.toString();
  };

  return (
    <>
      <div style={{ "margin-bottom": "8px" }}>
        <button onClick={() => void initialize()}>Initialize</button>
        <button onClick={openWithShare} style={{ "margin-left": "8px" }}>
          Open with Share
        </button>
      </div>
      <Show when={state.panesShare.isActive} fallback={<LifeLogs />}>
        <Share />
      </Show>
      <Toast />
    </>
  );
}

function ManyLifeLogsSetup() {
  const firestore = useFirestoreService();

  const batchVersion = getCollection(firestore, "batchVersion");
  const lifeLogs = getCollection(firestore, "lifeLogs");

  const { updateState } = useStoreService();

  onMount(() => {
    (async () => {
      await fetch("http://localhost:8080/emulator/v1/projects/demo/databases/(default)/documents", {
        method: "DELETE",
      });

      const batch = writeBatch(firestore.firestore);

      batch.set(doc(batchVersion, singletonDocumentId), {
        version: "__INITIAL__",
        prevVersion: "",
        createdAt: Timestamp.fromDate(new Date()),
        updatedAt: Timestamp.fromDate(new Date()),
      });

      // Generate 120 lifeLogs at 12-hour intervals (60 days)
      const now = Date.now();
      for (let i = 0; i < 120; i++) {
        const startTime = new Date(now - i * 12 * hourMs - 30 * 60 * 1000);
        const endTime = new Date(now - i * 12 * hourMs);

        batch.set(doc(lifeLogs, `$manyLog${String(i).padStart(3, "0")}`), {
          text: `lifelog ${120 - i} (${i * 12}h ago)`,
          hasTreeNodes: false,
          startAt: Timestamp.fromDate(startTime),
          endAt: Timestamp.fromDate(endTime),
          createdAt: Timestamp.fromDate(new Date()),
          updatedAt: Timestamp.fromDate(new Date()),
        });
      }

      await batch.commit();

      updateState((state) => {
        state.panesLifeLogs.selectedLifeLogId = "$manyLog000";
        state.panesLifeLogs.selectedLifeLogNodeId = "";
      });
    })().catch((error: unknown) => {
      console.error("Error initializing Firestore data:", error);
    });
  });

  return <LifeLogs />;
}

export const ManyLifeLogs: StoryObj = {
  render() {
    return (
      <StoreServiceProvider>
        <StorybookFirebaseWrapper showConfig={false}>
          <Suspense fallback={<span>loading....</span>}>
            <ManyLifeLogsSetup />
          </Suspense>
        </StorybookFirebaseWrapper>
      </StoreServiceProvider>
    );
  },
};

export const SharePane: StoryObj = {
  render() {
    return (
      <StoreServiceProvider>
        <StorybookFirebaseWrapper showConfig={false}>
          <Suspense fallback={<span>loading....</span>}>
            <ShareStory />
          </Suspense>
        </StorybookFirebaseWrapper>
      </StoreServiceProvider>
    );
  },
};

function EditHistorySetup() {
  const firestore = useFirestoreService();

  const batchVersion = getCollection(firestore, "batchVersion");
  const lifeLogs = getCollection(firestore, "lifeLogs");
  const lifeLogTreeNodes = getCollection(firestore, "lifeLogTreeNodes");
  const editHistory = getCollection(firestore, "editHistory");
  const editHistoryHead = getCollection(firestore, "editHistoryHead");

  const { updateState } = useStoreService();

  onMount(() => {
    (async () => {
      await fetch("http://localhost:8080/emulator/v1/projects/demo/databases/(default)/documents", {
        method: "DELETE",
      });

      const batch = writeBatch(firestore.firestore);

      batch.set(doc(batchVersion, singletonDocumentId), {
        version: "__INITIAL__",
        prevVersion: "",
        createdAt: Timestamp.fromDate(new Date()),
        updatedAt: Timestamp.fromDate(new Date()),
      });

      batch.set(doc(lifeLogs, "$log1"), {
        text: "lifelog1",
        hasTreeNodes: true,
        startAt: noneTimestamp,
        endAt: noneTimestamp,
        createdAt: Timestamp.fromDate(new Date()),
        updatedAt: Timestamp.fromDate(new Date()),
      });

      batch.set(doc(lifeLogTreeNodes, "child1"), {
        text: "child1",
        lifeLogId: "$log1",
        parentId: "$log1",
        order: "a0",
        createdAt: Timestamp.fromDate(new Date()),
        updatedAt: Timestamp.fromDate(new Date()),
      });

      // Create edit history entries with branches
      const now = new Date();
      const t = (minutesAgo: number) => Timestamp.fromDate(new Date(now.getTime() - minutesAgo * 60 * 1000));

      // Linear chain: entry1 → entry2 → entry3
      batch.set(doc(editHistory, "entry1"), {
        parentId: "",
        description: "LifeLog作成",
        operations: [],
        inverseOperations: [],
        prevSelection: {},
        nextSelection: {},
        createdAt: t(10),
        updatedAt: t(10),
      });
      batch.set(doc(editHistory, "entry2"), {
        parentId: "entry1",
        description: "テキスト編集",
        operations: [],
        inverseOperations: [],
        prevSelection: {},
        nextSelection: {},
        createdAt: t(8),
        updatedAt: t(8),
      });
      batch.set(doc(editHistory, "entry3"), {
        parentId: "entry2",
        description: "時刻設定",
        operations: [],
        inverseOperations: [],
        prevSelection: {},
        nextSelection: {},
        createdAt: t(6),
        updatedAt: t(6),
      });

      // Branch from entry2: entry4 → entry5
      batch.set(doc(editHistory, "entry4"), {
        parentId: "entry2",
        description: "ノード追加",
        operations: [],
        inverseOperations: [],
        prevSelection: {},
        nextSelection: {},
        createdAt: t(4),
        updatedAt: t(4),
      });
      batch.set(doc(editHistory, "entry5"), {
        parentId: "entry4",
        description: "ノードテキスト編集",
        operations: [],
        inverseOperations: [],
        prevSelection: {},
        nextSelection: {},
        createdAt: t(2),
        updatedAt: t(2),
      });

      // Child of entry3 (branch has its own chain): entry8
      batch.set(doc(editHistory, "entry8"), {
        parentId: "entry3",
        description: "ノード統合",
        operations: [],
        inverseOperations: [],
        prevSelection: {},
        nextSelection: {},
        createdAt: t(5),
        updatedAt: t(5),
      });

      // Another child of entry3 (branch within a branch): entry9
      batch.set(doc(editHistory, "entry9"), {
        parentId: "entry3",
        description: "テキスト編集2",
        operations: [],
        inverseOperations: [],
        prevSelection: {},
        nextSelection: {},
        createdAt: t(4.5),
        updatedAt: t(4.5),
      });

      // 3rd branch from entry2: entry7
      batch.set(doc(editHistory, "entry7"), {
        parentId: "entry2",
        description: "インデント変更",
        operations: [],
        inverseOperations: [],
        prevSelection: {},
        nextSelection: {},
        createdAt: t(3),
        updatedAt: t(3),
      });

      // Another branch from entry1: entry6
      batch.set(doc(editHistory, "entry6"), {
        parentId: "entry1",
        description: "LifeLog削除",
        operations: [],
        inverseOperations: [],
        prevSelection: {},
        nextSelection: {},
        createdAt: t(1),
        updatedAt: t(1),
      });

      // Set head to entry5 (end of second branch from entry2)
      batch.set(doc(editHistoryHead, singletonDocumentId), {
        entryId: "entry5",
        createdAt: Timestamp.fromDate(now),
        updatedAt: Timestamp.fromDate(now),
      });

      await batch.commit();

      updateState((state) => {
        state.panesLifeLogs.selectedLifeLogId = "$log1";
        state.panesLifeLogs.selectedLifeLogNodeId = "";
        state.editHistory.isPanelOpen = true;
      });
    })().catch((error: unknown) => {
      console.error("Error initializing edit history data:", error);
    });
  });

  return (
    <div style={{ height: "100svh" }}>
      <WithEditHistoryPanel>
        <LifeLogs />
      </WithEditHistoryPanel>
    </div>
  );
}

export const EditHistoryPanelStory: StoryObj = {
  name: "EditHistoryPanel",
  render() {
    return (
      <StoreServiceProvider>
        <StorybookFirebaseWrapper showConfig={false}>
          <Suspense fallback={<span>loading....</span>}>
            <EditHistorySetup />
          </Suspense>
        </StorybookFirebaseWrapper>
      </StoreServiceProvider>
    );
  },
};

function LongHistorySetup() {
  const firestore = useFirestoreService();

  const batchVersion = getCollection(firestore, "batchVersion");
  const lifeLogs = getCollection(firestore, "lifeLogs");

  const { updateState } = useStoreService();

  onMount(() => {
    (async () => {
      await fetch("http://localhost:8080/emulator/v1/projects/demo/databases/(default)/documents", {
        method: "DELETE",
      });

      // Initial setup: create batchVersion + 1 lifeLog
      const setupBatch = writeBatch(firestore.firestore);
      setupBatch.set(doc(batchVersion, singletonDocumentId), {
        version: "__INITIAL__",
        prevVersion: "",
        createdAt: Timestamp.fromDate(new Date()),
        updatedAt: Timestamp.fromDate(new Date()),
      });
      setupBatch.set(doc(lifeLogs, "$log1"), {
        text: "initial",
        hasTreeNodes: false,
        startAt: noneTimestamp,
        endAt: noneTimestamp,
        createdAt: Timestamp.fromDate(new Date()),
        updatedAt: Timestamp.fromDate(new Date()),
      });
      await setupBatch.commit();

      // Wait for subscription to catch up
      await new Promise((resolve) => setTimeout(resolve, 300));

      // Perform many real operations via runBatch + undo to create branches.
      // Every 8 edits, undo 3 times then continue editing to create a branch.
      for (let i = 0; i < 40; i++) {
        await runBatch(
          firestore,
          (batch) => {
            batch.update(lifeLogs, { id: "$log1", text: `edit-${i}` });
            return Promise.resolve();
          },
          {
            description: "テキスト編集",
            prevSelection: { lifeLogs: "$log1" },
          },
        );

        // Every 8 edits, create a branch: undo 3 times then continue
        if (i > 0 && i % 8 === 0) {
          for (let u = 0; u < 3; u++) {
            await undoEngine(firestore);
          }
        }
      }

      updateState((state) => {
        state.panesLifeLogs.selectedLifeLogId = "$log1";
        state.panesLifeLogs.selectedLifeLogNodeId = "";
        state.editHistory.isPanelOpen = true;
      });
    })().catch((error: unknown) => {
      console.error("Error initializing long history data:", error);
    });
  });

  return (
    <div style={{ height: "100svh" }}>
      <WithEditHistoryPanel>
        <LifeLogs />
      </WithEditHistoryPanel>
    </div>
  );
}

export const EditHistoryPanelLongScrollStory: StoryObj = {
  name: "EditHistoryPanel (long, scrollable)",
  render() {
    return (
      <StoreServiceProvider>
        <StorybookFirebaseWrapper showConfig={false}>
          <Suspense fallback={<span>loading....</span>}>
            <LongHistorySetup />
          </Suspense>
        </StorybookFirebaseWrapper>
      </StoreServiceProvider>
    );
  },
};
