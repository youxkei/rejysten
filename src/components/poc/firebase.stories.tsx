import type { Meta, StoryObj } from "storybook-solidjs";

import { doc, getDocs, deleteDoc, runTransaction } from "firebase/firestore";
import { For, Suspense, createSignal } from "solid-js";
import { uuidv7 } from "uuidv7";

import { FirebaseServiceProvoider, getCollection, useFirebaseService } from "@/services/firebase";
import { createSubscribeAllSignal } from "@/services/firebase/subscribe";
import { dumpSignal } from "@/solid/signal";

export default {
  title: "poc/firebase",
} satisfies Meta;

const firebaseConfig = `{ apiKey: "apiKey", authDomain: "authDomain", projectId: "demo", storageBucket: "", messagingSenderId: "", appId: "", measurementId: "" }`;

export const FirestoreTest: StoryObj = {
  render() {
    const [errors$, setErrors] = createSignal([] as string[]);

    return (
      <>
        <pre>{errors$().join("\n")}</pre>

        <FirebaseServiceProvoider useEmulator configYAML={firebaseConfig} setErrors={setErrors}>
          <Suspense fallback={<p>loading...</p>}>
            {(() => {
              const firebase = useFirebaseService();
              const itemCollection = getCollection(firebase, "pocFirestoreTest");

              const items$ = createSubscribeAllSignal(() => itemCollection);

              return (
                <>
                  <p>items:</p>
                  <For each={items$()}>
                    {(item) => (
                      <p>
                        {item.id}: {item.data().text}
                      </p>
                    )}
                  </For>
                </>
              );
            })()}
          </Suspense>
        </FirebaseServiceProvoider>
      </>
    );
  },
};

export const FirestorePublish: StoryObj = {
  render() {
    const [errors$, setErrors] = createSignal([] as string[]);

    return (
      <>
        <pre>{errors$().join("\n")}</pre>

        <FirebaseServiceProvoider useEmulator configYAML={firebaseConfig} setErrors={setErrors}>
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

export const FirestoreSubscribe: StoryObj = {
  render() {
    const [errors$, setErrors] = createSignal([] as string[]);

    return (
      <>
        <pre>{errors$().join("\n")}</pre>

        <FirebaseServiceProvoider useEmulator configYAML={firebaseConfig} setErrors={setErrors}>
          <Suspense fallback={<p>loading...</p>}>
            {(() => {
              const firebase = useFirebaseService();
              const itemCollection = getCollection(firebase, "pocFirestorePubsub");
              const items$ = dumpSignal(createSubscribeAllSignal(() => itemCollection));
              return (
                <>
                  <p>items:</p>
                  <For each={items$()}>{(item) => <p>{item.id}</p>}</For>
                </>
              );
            })()}
          </Suspense>
        </FirebaseServiceProvoider>
      </>
    );
  },
};
