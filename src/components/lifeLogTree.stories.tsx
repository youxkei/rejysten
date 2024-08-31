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
            <Suspense>
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

                    createdAt: Timestamp.fromDate(new Date()),
                    updatedAt: Timestamp.fromDate(new Date()),
                  });

                  batch.set(doc(lifeLogTreeNodes, "child2"), {
                    text: "child2",

                    parentId: "log1",
                    prevId: "child1",
                    nextId: "",

                    createdAt: Timestamp.fromDate(new Date()),
                    updatedAt: Timestamp.fromDate(new Date()),
                  });

                  batch.set(doc(lifeLogTreeNodes, "child1 of child1"), {
                    text: "child1 of child1",

                    parentId: "child1",
                    prevId: "",
                    nextId: "",

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
