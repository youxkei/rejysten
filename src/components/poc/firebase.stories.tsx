import type { Meta, StoryObj } from "storybook-solidjs";

import { doc, getDocs, deleteDoc, runTransaction } from "firebase/firestore";
import { For, createResource, createSignal } from "solid-js";
import { uuidv7 } from "uuidv7";

import { FirebaseServiceProvoider, getCollection, useFirebaseService } from "@/services/firebase";

export default {
  title: "poc/firebase",
} satisfies Meta;

export const FirestoreTest: StoryObj = {
  render() {
    const [configYAML$, setConfigYAML] = createSignal("");
    const [errors$, setErrors] = createSignal([] as string[]);

    return (
      <>
        <input
          type="text"
          value={configYAML$()}
          onInput={(e) => {
            setErrors([]);
            setConfigYAML(e.currentTarget.value);
          }}
        />

        <pre>{errors$().join("\n")}</pre>

        <FirebaseServiceProvoider configYAML={configYAML$()} setErrors={setErrors}>
          {(() => {
            const firebase = useFirebaseService();
            const itemCollection = getCollection(firebase, "pocFirestoreTest");

            const [items$] = createResource(() => getDocs(itemCollection));

            return (
              <>
                <p>items:</p>
                <For each={items$()?.docs}>
                  {(item) => (
                    <p>
                      {item.id}: {item.data().text}
                    </p>
                  )}
                </For>
              </>
            );
          })()}
        </FirebaseServiceProvoider>
      </>
    );
  },
};

export const FirestorePublish: StoryObj = {
  render() {
    const [configYAML$, setConfigYAML] = createSignal("");
    const [errors$, setErrors] = createSignal([] as string[]);

    return (
      <>
        <input
          type="text"
          value={configYAML$()}
          onInput={(e) => {
            setErrors([]);
            setConfigYAML(e.currentTarget.value);
          }}
        />

        <pre>{errors$().join("\n")}</pre>

        <FirebaseServiceProvoider configYAML={configYAML$()} setErrors={setErrors}>
          {(() => {
            const firebase = useFirebaseService();
            const itemCollection = getCollection(firebase, "pocFirestorePubsub");

            return (
              <>
                <button
                  onClick={async () => {
                    for (const item of (await getDocs(itemCollection)).docs) {
                      await deleteDoc(doc(itemCollection, item.id));
                    }
                  }}
                >
                  delete all
                </button>
                <button
                  onClick={async () => {
                    let currentItemId = uuidv7();

                    for (;;) {
                      const currentItemRef = doc(itemCollection, currentItemId);

                      const nextItemId = uuidv7();
                      const nextItemRef = doc(itemCollection, nextItemId);

                      await runTransaction(firebase.firestore, async (transaction) => {
                        if ((await transaction.get(currentItemRef)).exists()) {
                          transaction.update(currentItemRef, {
                            nextId: nextItemId,
                          });
                        } else {
                          transaction.set(currentItemRef, {
                            prevId: "",
                            nextId: nextItemId,
                          });
                        }

                        transaction.set(nextItemRef, {
                          prevId: currentItemId,
                          nextId: "",
                        });
                      });

                      console.log(`publish ${nextItemId}`);
                      currentItemId = nextItemId;
                      await new Promise((resolve) => setTimeout(resolve, 5000));
                    }
                  }}
                >
                  publish
                </button>
              </>
            );
          })()}
        </FirebaseServiceProvoider>
      </>
    );
  },
};
