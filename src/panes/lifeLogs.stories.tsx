import { type Meta, type StoryObj } from "@kachurun/storybook-solid-vite";
import { doc, Timestamp, writeBatch } from "firebase/firestore";
import { onMount, Suspense, type JSXElement, createSignal } from "solid-js";

import { LifeLogs, LifeLogTree } from "@/panes/lifeLogs";
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

function StorybookFirebaseWrapper(props: { children: JSXElement }) {
  const [configText, setConfigText] = createSignal(firebaseConfig);
  const [errors, setErrors] = createSignal<string[]>([]);

  return (
    <FirebaseServiceProvider configYAML={configText()} setErrors={setErrors}>
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
                const batch = writeBatch(firestore.firestore);

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

                batch.set(doc(lifeLogs, "$log2"), {
                  text: "lifelog2",
                  startAt: noneTimestamp,
                  endAt: noneTimestamp,
                  createdAt: Timestamp.fromDate(new Date()),
                  updatedAt: Timestamp.fromDate(new Date()),
                });

                batch.set(doc(lifeLogTreeNodes, "child1"), {
                  text: "child1",

                  parentId: "log1",
                  prevId: "",
                  nextId: "child2",
                  aboveId: "",
                  belowId: "child1 of child1",

                  createdAt: Timestamp.fromDate(new Date()),
                  updatedAt: Timestamp.fromDate(new Date()),
                });

                batch.set(doc(lifeLogTreeNodes, "child2"), {
                  text: "child2",

                  parentId: "log1",
                  prevId: "child1",
                  nextId: "child3",
                  aboveId: "child1 of child1",
                  belowId: "child3",

                  createdAt: Timestamp.fromDate(new Date()),
                  updatedAt: Timestamp.fromDate(new Date()),
                });

                batch.set(doc(lifeLogTreeNodes, "child3"), {
                  text: "child3",

                  parentId: "log1",
                  prevId: "child2",
                  nextId: "child4",
                  aboveId: "child2",
                  belowId: "child4",

                  createdAt: Timestamp.fromDate(new Date()),
                  updatedAt: Timestamp.fromDate(new Date()),
                });

                batch.set(doc(lifeLogTreeNodes, "child4"), {
                  text: "child4",

                  parentId: "log1",
                  prevId: "child3",
                  nextId: "child5",
                  aboveId: "child3",
                  belowId: "child5",

                  createdAt: Timestamp.fromDate(new Date()),
                  updatedAt: Timestamp.fromDate(new Date()),
                });

                batch.set(doc(lifeLogTreeNodes, "child5"), {
                  text: "child5",

                  parentId: "log1",
                  prevId: "child4",
                  nextId: "child6",
                  aboveId: "child4",
                  belowId: "child6",

                  createdAt: Timestamp.fromDate(new Date()),
                  updatedAt: Timestamp.fromDate(new Date()),
                });

                batch.set(doc(lifeLogTreeNodes, "child6"), {
                  text: "child6",

                  parentId: "log1",
                  prevId: "child5",
                  nextId: "",
                  aboveId: "child5",
                  belowId: "",

                  createdAt: Timestamp.fromDate(new Date()),
                  updatedAt: Timestamp.fromDate(new Date()),
                });

                batch.set(doc(lifeLogTreeNodes, "child1 of child1"), {
                  text: "child1 of child1",

                  parentId: "child1",
                  prevId: "",
                  nextId: "",
                  aboveId: "child1",
                  belowId: "child2",

                  createdAt: Timestamp.fromDate(new Date()),
                  updatedAt: Timestamp.fromDate(new Date()),
                });

                void batch.commit();

                updateState((state) => {
                  state.panesLifeLogs.selectedLifeLogId = "$log1";
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

export const LifeLogTreeStory: StoryObj = {
  render() {
    return (
      <StoreServiceProvider>
        <StorybookFirebaseWrapper>
          <Suspense>
            {(() => {
              const firestore = useFirestoreService();

              const batchVersion = getCollection(firestore, "batchVersion");
              const lifeLogs = getCollection(firestore, "lifeLogs");
              const lifeLogTreeNodes = getCollection(firestore, "lifeLogTreeNodes");

              const { updateState } = useStoreService();

              onMount(() => {
                const batch = writeBatch(firestore.firestore);

                batch.set(doc(batchVersion, singletonDocumentId), {
                  version: "__INITIAL__",
                  prevVersion: "",
                  createdAt: Timestamp.fromDate(new Date()),
                  updatedAt: Timestamp.fromDate(new Date()),
                });

                batch.set(doc(lifeLogs, "log1"), {
                  text: "lifelog",
                  startAt: new Timestamp(0, 0),
                  endAt: new Timestamp(0, 0),
                  createdAt: Timestamp.fromDate(new Date()),
                  updatedAt: Timestamp.fromDate(new Date()),
                });

                batch.set(doc(lifeLogTreeNodes, "child1"), {
                  text: "child1",

                  parentId: "log1",
                  prevId: "",
                  nextId: "child2",
                  aboveId: "",
                  belowId: "child1 of child1",

                  createdAt: Timestamp.fromDate(new Date()),
                  updatedAt: Timestamp.fromDate(new Date()),
                });

                batch.set(doc(lifeLogTreeNodes, "child2"), {
                  text: "child2",

                  parentId: "log1",
                  prevId: "child1",
                  nextId: "child3",
                  aboveId: "child1 of child1",
                  belowId: "child3",

                  createdAt: Timestamp.fromDate(new Date()),
                  updatedAt: Timestamp.fromDate(new Date()),
                });

                batch.set(doc(lifeLogTreeNodes, "child3"), {
                  text: "child3",

                  parentId: "log1",
                  prevId: "child2",
                  nextId: "child4",
                  aboveId: "child2",
                  belowId: "child4",

                  createdAt: Timestamp.fromDate(new Date()),
                  updatedAt: Timestamp.fromDate(new Date()),
                });

                batch.set(doc(lifeLogTreeNodes, "child4"), {
                  text: "child4",

                  parentId: "log1",
                  prevId: "child3",
                  nextId: "child5",
                  aboveId: "child3",
                  belowId: "child5",

                  createdAt: Timestamp.fromDate(new Date()),
                  updatedAt: Timestamp.fromDate(new Date()),
                });

                batch.set(doc(lifeLogTreeNodes, "child5"), {
                  text: "child5",

                  parentId: "log1",
                  prevId: "child4",
                  nextId: "child6",
                  aboveId: "child4",
                  belowId: "child6",

                  createdAt: Timestamp.fromDate(new Date()),
                  updatedAt: Timestamp.fromDate(new Date()),
                });

                batch.set(doc(lifeLogTreeNodes, "child6"), {
                  text: "child6",

                  parentId: "log1",
                  prevId: "child5",
                  nextId: "",
                  aboveId: "child5",
                  belowId: "",

                  createdAt: Timestamp.fromDate(new Date()),
                  updatedAt: Timestamp.fromDate(new Date()),
                });

                batch.set(doc(lifeLogTreeNodes, "child1 of child1"), {
                  text: "child1 of child1",

                  parentId: "child1",
                  prevId: "",
                  nextId: "",
                  aboveId: "child1",
                  belowId: "child2",

                  createdAt: Timestamp.fromDate(new Date()),
                  updatedAt: Timestamp.fromDate(new Date()),
                });

                void batch.commit();

                updateState((state) => {
                  state.panesLifeLogs.selectedLifeLogId = "log1";
                });
              });

              return <LifeLogTree id="log1" prevId="" nextId="" />;
            })()}
          </Suspense>
        </StorybookFirebaseWrapper>
      </StoreServiceProvider>
    );
  },
};
