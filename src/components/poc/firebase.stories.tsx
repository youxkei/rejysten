import type { Meta, StoryObj } from "storybook-solidjs";

import { doc, getDocs, deleteDoc, runTransaction, query, where, setDoc, FieldPath } from "firebase/firestore";
import { For, Suspense, createSignal, createMemo, Show, startTransition } from "solid-js";
import { uuidv7 } from "uuidv7";

import { FirebaseServiceProvoider, getCollection, useFirebaseService } from "@/services/firebase";
import { createSubscribeAllSignal } from "@/services/firebase/subscribe";
import { dumpSignal } from "@/solid/signal";

export default {
  title: "poc/firebase",
} satisfies Meta;

const firebaseConfig = `{ apiKey: "apiKey", authDomain: "authDomain", projectId: "demo", storageBucket: "", messagingSenderId: "", appId: "", measurementId: "" }`;

function calcBigram(chars: string[]) {
  const bigram = {} as Record<string, boolean>;

  for (let i = 0; i < chars.length - 1; i++) {
    const bigramKey = chars[i] + chars[i + 1];
    bigram[bigramKey] = true;
  }

  return bigram;
}

export const FirestoreBigramTest: StoryObj = {
  render() {
    const [errors$, setErrors] = createSignal([] as string[]);

    return (
      <>
        <pre>{errors$().join("\n")}</pre>

        <FirebaseServiceProvoider useEmulator configYAML={firebaseConfig} setErrors={setErrors}>
          <Suspense fallback={<p>loading...</p>}>
            {(() => {
              const [text$, setText] = createSignal("");
              const [searchText$, setSearchText] = createSignal("");
              const searchTextChars$ = createMemo(() => [...searchText$()], []);

              const firebase = useFirebaseService();
              const itemCollection = getCollection(firebase, "pocFirestoreBigramTest");

              const items$ = createSubscribeAllSignal(() => itemCollection);

              const serchedItems$ = createSubscribeAllSignal(() => {
                const searchTextChars = searchTextChars$();
                if (searchTextChars.length < 2) return;

                const bigram = calcBigram(searchTextChars);

                return Object.keys(bigram).reduce((q, bigramKey) => {
                  return query(q, where(new FieldPath("bigram", bigramKey), "==", true));
                }, query(itemCollection));
              });

              return (
                <>
                  <p>
                    <span>search:</span>
                    <span>
                      <input
                        value={searchText$()}
                        onInput={(e) => {
                          const text = e.currentTarget.value;

                          void startTransition(() => {
                            setSearchText(text);
                          });
                        }}
                      />
                    </span>
                  </p>
                  <p>searched items:</p>
                  <Show when={searchTextChars$().length >= 2}>
                    <For each={serchedItems$()}>{(item) => <p>{item.data().text}</p>}</For>
                  </Show>
                  <hr />
                  <p>
                    <span>
                      <input value={text$()} onInput={(e) => setText(e.currentTarget.value)} />
                    </span>
                    <button
                      onClick={async () => {
                        await setDoc(doc(itemCollection, uuidv7()), {
                          text: text$(),
                          bigram: calcBigram([...text$()]),
                        });

                        setText("");
                      }}
                    >
                      add
                    </button>
                  </p>
                  <p>items:</p>
                  <For each={items$()}>{(item) => <p> {item.data().text} </p>}</For>
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
