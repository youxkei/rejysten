import type { Meta, StoryObj } from "storybook-solidjs";

import { doc, getDocs, runTransaction, query, where, FieldPath, writeBatch } from "firebase/firestore";
import { For, Suspense, createSignal, createMemo, Show, startTransition } from "solid-js";
import { uuidv7 } from "uuidv7";
import XRegExp from "xregexp";

import { FirebaseServiceProvoider, useFirebaseService } from "@/services/firebase";
import { getCollection } from "@/services/firebase/firestore/collections";
import { createSubscribeAllSignal } from "@/services/firebase/subscribe";
import { dumpSignal } from "@/solid/signal";

export default {
  title: "poc/firebase",
} satisfies Meta;

const firebaseConfig = `{ apiKey: "apiKey", authDomain: "authDomain", projectId: "demo", storageBucket: "", messagingSenderId: "", appId: "", measurementId: "" }`;

const nonPrintableUnicodeRegex = XRegExp("[\\p{C}\\p{Z}]", "g");

function trimNonPrintableChars(text: string) {
  return XRegExp.replace(text, nonPrintableUnicodeRegex, "");
}

function calcBigram(chars: string[]) {
  const bigram = {} as Record<string, true>;

  for (let i = 0; i < chars.length - 1; i++) {
    const bigramKey = chars[i] + chars[i + 1];
    bigram[bigramKey] = true;
  }

  return bigram;
}

export const FirestoreNgram: StoryObj = {
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
              const searchTextChars$ = createMemo(() => [...trimNonPrintableChars(searchText$())], []);

              const firebase = useFirebaseService();
              const itemCollection = getCollection(firebase, "pocFirestoreNgram");
              const bigramCollection = getCollection(firebase, "ngrams");

              const items$ = createSubscribeAllSignal(() => itemCollection);

              const serchedItems$ = createSubscribeAllSignal(() => {
                const searchTextChars = searchTextChars$();
                if (searchTextChars.length < 2) return;

                const bigram = calcBigram(searchTextChars);

                return Object.keys(bigram).reduce(
                  (q, bigramKey) => {
                    return query(q, where(new FieldPath("ngram", bigramKey), "==", true));
                  },
                  query(bigramCollection, where("collection", "==", "pocFirestoreNgram")),
                );
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
                        const text = text$();
                        setText("");

                        await startTransition(async () => {
                          const batch = writeBatch(firebase.firestore);
                          const id = uuidv7();

                          batch.set(doc(itemCollection, id), {
                            text,
                          });

                          batch.set(doc(bigramCollection, id), {
                            collection: "pocFirestoreNgram",
                            text,
                            ngram: calcBigram([...trimNonPrintableChars(text)]),
                          });

                          await batch.commit();
                        });
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
                    const batch = writeBatch(firebase.firestore);

                    for (const item of (await getDocs(itemCollection)).docs) {
                      batch.delete(item.ref);
                    }

                    await batch.commit();
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

export const FirestoreSubcollection: StoryObj = {
  render() {
    const [errors$, setErrors] = createSignal([] as string[]);

    return (
      <>
        <pre>{errors$().join("\n")}</pre>

        <FirebaseServiceProvoider useEmulator configYAML={firebaseConfig} setErrors={setErrors}>
          <Suspense fallback={<p>loading...</p>}>
            {(() => {
              const firebase = useFirebaseService();
              const itemCollection = getCollection(firebase, "pocFirestoreSubcollection");
              const id = uuidv7();

              return (
                <>
                  <button
                    onClick={async () => {
                      const batch = writeBatch(firebase.firestore);

                      const docRef = doc(itemCollection, id);

                      batch.set(docRef, {
                        text: "text",
                      });

                      batch.set(doc(docRef, "subcollection", id), {
                        text: "subtext",
                      });

                      await batch.commit();
                    }}
                  >
                    add
                  </button>
                  <button
                    onClick={async () => {
                      const batch = writeBatch(firebase.firestore);

                      batch.delete(doc(itemCollection, id));

                      await batch.commit();
                    }}
                  >
                    delete doc
                  </button>
                  <button
                    onClick={async () => {
                      const batch = writeBatch(firebase.firestore);

                      batch.delete(doc(itemCollection, id, "subcollection", id));

                      await batch.commit();
                    }}
                  >
                    delete subcollection
                  </button>
                </>
              );
            })()}
          </Suspense>
        </FirebaseServiceProvoider>
      </>
    );
  },
};
