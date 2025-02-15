import { doc, Timestamp, writeBatch } from "firebase/firestore";
import { createSignal, onMount, Suspense } from "solid-js";
import { type Meta, type StoryObj } from "storybook-solidjs";

import { LifeLogTree } from "@/components/lifeLogTree";
import { FirebaseServiceProvoider, useFirebaseService } from "@/services/firebase";
import { getCollection } from "@/services/firebase/firestore";
import { StoreServiceProvider, useStoreService } from "@/services/store";

export default {
  title: "lifeLogTree",
} satisfies Meta;

const firebaseConfig = `{ apiKey: "apiKey", authDomain: "authDomain", projectId: "demo", storageBucket: "", messagingSenderId: "", appId: "", measurementId: "" }`;

export const LifeLogTreeStory: StoryObj = {
  render() {
    const [errors$, setErrors] = createSignal([] as string[]);

    return (
      <>
        <pre>
          <code>{errors$().join("\n")}</code>
        </pre>
        <FirebaseServiceProvoider configYAML={firebaseConfig} setErrors={setErrors}>
          <StoreServiceProvider>
            <Suspense fallback={<p>loading</p>}>
              {(() => {
                const firebase = useFirebaseService();

                const lifeLogs = getCollection(firebase, "lifeLogs");
                const lifeLogTreeNodes = getCollection(firebase, "lifeLogTreeNodes");

                const { updateState } = useStoreService();

                onMount(() => {
                  const batch = writeBatch(firebase.firestore);

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
                    state.lifeLogs.selectedId = "log1";
                  });
                });

                return <LifeLogTree id="log1" prevId="" nextId="" />;
              })()}
            </Suspense>
          </StoreServiceProvider>
        </FirebaseServiceProvoider>
      </>
    );
  },
};
