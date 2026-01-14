import { doc, getDocs, Timestamp, writeBatch } from "firebase/firestore";
import { onMount, Suspense, type JSXElement, createSignal } from "solid-js";
import { type Meta, type StoryObj } from "storybook-solidjs-vite";

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

export default {
  title: "panes/lifeLogs",
} satisfies Meta;

const firebaseConfig = `{ apiKey: "apiKey", authDomain: "authDomain", projectId: "demo", storageBucket: "", messagingSenderId: "", appId: "", measurementId: "" }`;

function StorybookFirebaseWrapper(props: { children: JSXElement; showConfig?: boolean }) {
  const [configText, setConfigText] = createSignal(firebaseConfig);
  const [errors, setErrors] = createSignal<string[]>([]);

  return (
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
          <pre>{errors().join("\n")}</pre>
        </>
      )}
      <FirestoreServiceProvider>{props.children}</FirestoreServiceProvider>
    </FirebaseServiceProvider>
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
                  const batch = writeBatch(firestore.firestore);

                  for (const lifeLog of (await getDocs(lifeLogs)).docs) {
                    batch.delete(lifeLog.ref);
                  }

                  for (const lifeLogTreeNode of (await getDocs(lifeLogTreeNodes)).docs) {
                    batch.delete(lifeLogTreeNode.ref);
                  }

                  batch.set(doc(batchVersion, singletonDocumentId), {
                    version: "__INITIAL__",
                    prevVersion: "",
                    createdAt: Timestamp.fromDate(new Date()),
                    updatedAt: Timestamp.fromDate(new Date()),
                  });

                  batch.set(doc(lifeLogs, "$log1"), {
                    text: "lifelog1",
                    startAt: noneTimestamp,
                    endAt: noneTimestamp,
                    createdAt: Timestamp.fromDate(new Date()),
                    updatedAt: Timestamp.fromDate(new Date()),
                  });

                  batch.set(doc(lifeLogTreeNodes, "child1"), {
                    text: "child1",
                    parentId: "$log1",
                    order: "a0",
                    createdAt: Timestamp.fromDate(new Date()),
                    updatedAt: Timestamp.fromDate(new Date()),
                  });

                  batch.set(doc(lifeLogTreeNodes, "child2"), {
                    text: "child2",
                    parentId: "$log1",
                    order: "a1",
                    createdAt: Timestamp.fromDate(new Date()),
                    updatedAt: Timestamp.fromDate(new Date()),
                  });

                  batch.set(doc(lifeLogTreeNodes, "child3"), {
                    text: "child3",
                    parentId: "$log1",
                    order: "a2",
                    createdAt: Timestamp.fromDate(new Date()),
                    updatedAt: Timestamp.fromDate(new Date()),
                  });

                  batch.set(doc(lifeLogTreeNodes, "child4"), {
                    text: "child4",
                    parentId: "$log1",
                    order: "a3",
                    createdAt: Timestamp.fromDate(new Date()),
                    updatedAt: Timestamp.fromDate(new Date()),
                  });

                  batch.set(doc(lifeLogTreeNodes, "child5"), {
                    text: "child5",
                    parentId: "$log1",
                    order: "a4",
                    createdAt: Timestamp.fromDate(new Date()),
                    updatedAt: Timestamp.fromDate(new Date()),
                  });

                  batch.set(doc(lifeLogTreeNodes, "child6"), {
                    text: "child6",
                    parentId: "$log1",
                    order: "a5",
                    createdAt: Timestamp.fromDate(new Date()),
                    updatedAt: Timestamp.fromDate(new Date()),
                  });

                  batch.set(doc(lifeLogTreeNodes, "child1 of child1"), {
                    text: "child1 of child1",
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

export const LifeLogsFullscreen: StoryObj = {
  render() {
    return (
      <StoreServiceProvider>
        <StorybookFirebaseWrapper showConfig={false}>
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

                  for (const lifeLogTreeNode of (await getDocs(lifeLogTreeNodes)).docs) {
                    batch.delete(lifeLogTreeNode.ref);
                  }

                  batch.set(doc(batchVersion, singletonDocumentId), {
                    version: "__INITIAL__",
                    prevVersion: "",
                    createdAt: Timestamp.fromDate(new Date()),
                    updatedAt: Timestamp.fromDate(new Date()),
                  });

                  batch.set(doc(lifeLogs, "$log1"), {
                    text: "lifelog1",
                    startAt: noneTimestamp,
                    endAt: noneTimestamp,
                    createdAt: Timestamp.fromDate(new Date()),
                    updatedAt: Timestamp.fromDate(new Date()),
                  });

                  batch.set(doc(lifeLogTreeNodes, "child1"), {
                    text: "child1",
                    parentId: "$log1",
                    order: "a0",
                    createdAt: Timestamp.fromDate(new Date()),
                    updatedAt: Timestamp.fromDate(new Date()),
                  });

                  batch.set(doc(lifeLogTreeNodes, "child2"), {
                    text: "child2",
                    parentId: "$log1",
                    order: "a1",
                    createdAt: Timestamp.fromDate(new Date()),
                    updatedAt: Timestamp.fromDate(new Date()),
                  });

                  batch.set(doc(lifeLogTreeNodes, "child3"), {
                    text: "child3",
                    parentId: "$log1",
                    order: "a2",
                    createdAt: Timestamp.fromDate(new Date()),
                    updatedAt: Timestamp.fromDate(new Date()),
                  });

                  batch.set(doc(lifeLogTreeNodes, "child4"), {
                    text: "child4",
                    parentId: "$log1",
                    order: "a3",
                    createdAt: Timestamp.fromDate(new Date()),
                    updatedAt: Timestamp.fromDate(new Date()),
                  });

                  batch.set(doc(lifeLogTreeNodes, "child5"), {
                    text: "child5",
                    parentId: "$log1",
                    order: "a4",
                    createdAt: Timestamp.fromDate(new Date()),
                    updatedAt: Timestamp.fromDate(new Date()),
                  });

                  batch.set(doc(lifeLogTreeNodes, "child6"), {
                    text: "child6",
                    parentId: "$log1",
                    order: "a5",
                    createdAt: Timestamp.fromDate(new Date()),
                    updatedAt: Timestamp.fromDate(new Date()),
                  });

                  batch.set(doc(lifeLogTreeNodes, "child1 of child1"), {
                    text: "child1 of child1",
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
