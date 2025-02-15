import {
  doc,
  getDocs,
  runTransaction,
  query,
  where,
  FieldPath,
  writeBatch,
  Timestamp,
  disableNetwork,
  enableNetwork,
  onSnapshotsInSync,
} from "firebase/firestore";
import { For, Suspense, createSignal, createMemo, Show, startTransition, createComputed } from "solid-js";
import { type Meta, type StoryObj } from "storybook-solidjs";
import { uuidv7 } from "uuidv7";
import XRegExp from "xregexp";

import { FirebaseServiceProvoider, useFirebaseService } from "@/services/firebase";
import { getCollection } from "@/services/firebase/firestore";
import { createSubscribeAllSignal, createSubscribeSignal } from "@/services/firebase/firestore/subscribe";
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

declare module "@/services/firebase/firestore/schema" {
  interface Schema {
    pocFirestoreNgramItems: {
      text: string;
    };

    pocFirestoreNgrams: {
      collection: Exclude<keyof Schema, "pocFirestoreNgrams">;
      text: string;
      ngram: Record<string, true>;

      createdAt: Timestamp;
      updatedAt: Timestamp;
    };
  }
}

export const FirestoreNgram: StoryObj = {
  render() {
    const [errors$, setErrors] = createSignal([] as string[]);

    return (
      <>
        <pre>{errors$().join("\n")}</pre>

        <FirebaseServiceProvoider configYAML={firebaseConfig} setErrors={setErrors}>
          <Suspense fallback={<p>loading...</p>}>
            {(() => {
              const [text$, setText] = createSignal("");
              const [searchText$, setSearchText] = createSignal("");
              const searchTextChars$ = createMemo(() => [...trimNonPrintableChars(searchText$())], []);

              const firebase = useFirebaseService();
              const itemCollection = getCollection(firebase, "pocFirestoreNgramItems");
              const bigramCollection = getCollection(firebase, "pocFirestoreNgrams");

              const items$ = createSubscribeAllSignal(() => itemCollection);

              const serchedItems$ = createSubscribeAllSignal(() => {
                const searchTextChars = searchTextChars$();
                if (searchTextChars.length < 2) return;

                const bigram = calcBigram(searchTextChars);

                return Object.keys(bigram).reduce(
                  (q, bigramKey) => {
                    return query(q, where(new FieldPath("ngram", bigramKey), "==", true));
                  },
                  query(bigramCollection, where("collection", "==", "pocFirestoreNgramItems")),
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
                    <For each={serchedItems$()}>{(item) => <p>{item.text}</p>}</For>
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
                            collection: "pocFirestoreNgramItems",
                            text,
                            ngram: calcBigram([...trimNonPrintableChars(text)]),
                            createdAt: Timestamp.fromDate(new Date()),
                            updatedAt: Timestamp.fromDate(new Date()),
                          });

                          await batch.commit();
                        });
                      }}
                    >
                      add
                    </button>
                  </p>
                  <p>items:</p>
                  <For each={items$()}>{(item) => <p> {item.text} </p>}</For>
                </>
              );
            })()}
          </Suspense>
        </FirebaseServiceProvoider>
      </>
    );
  },
};

declare module "@/services/firebase/firestore/schema" {
  interface Schema {
    pocFirestorePubsub: {
      prevId: string;
      nextId: string;
    };
  }
}

export const FirestorePublish: StoryObj = {
  render() {
    const [errors$, setErrors] = createSignal([] as string[]);

    return (
      <>
        <pre>{errors$().join("\n")}</pre>

        <FirebaseServiceProvoider configYAML={firebaseConfig} setErrors={setErrors}>
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

        <FirebaseServiceProvoider configYAML={firebaseConfig} setErrors={setErrors}>
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

declare module "@/services/firebase/firestore/schema" {
  interface Schema {
    pocFirestoreSubcollection: {
      text: string;
    };
  }
}

export const FirestoreSubcollection: StoryObj = {
  render() {
    const [errors$, setErrors] = createSignal([] as string[]);

    return (
      <>
        <pre>{errors$().join("\n")}</pre>

        <FirebaseServiceProvoider configYAML={firebaseConfig} setErrors={setErrors}>
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

declare module "@/services/firebase/firestore/schema" {
  interface Schema {
    pocFirestoreRulesVersion: {
      version: string;
      prevVersion: string;
    };

    pocFirestoreRulesItems: Record<string, number>;
  }
}

export const FirestoreRules: StoryObj = {
  render() {
    const [errors$, setErrors] = createSignal([] as string[]);

    return (
      <>
        <pre>{errors$().join("\n")}</pre>

        <FirebaseServiceProvoider configYAML={firebaseConfig} setErrors={setErrors}>
          <Suspense fallback={<p>loading...</p>}>
            {(() => {
              const firebase = useFirebaseService();

              const [label$, setLabel] = createSignal("");

              const versionCollection = getCollection(firebase, "pocFirestoreRulesVersion");
              const itemCollection = getCollection(firebase, "pocFirestoreRulesItems");

              const version$ = createSubscribeSignal(() => doc(versionCollection, "version"));
              const items$ = createSubscribeAllSignal(() => itemCollection);

              return (
                <>
                  <input
                    value={label$()}
                    onInput={(e) => {
                      setLabel(e.currentTarget.value);
                    }}
                  />
                  <button
                    onClick={async () => {
                      const label = label$();
                      const version = version$();
                      const items = items$();

                      if (!label) return;

                      const newVersion = uuidv7();
                      const id = uuidv7();

                      const batch = writeBatch(firebase.firestore);

                      for (const item of items) {
                        batch.update(doc(itemCollection, item.id), {
                          [label]: (item[label] ?? 0) + 1,
                        });
                      }

                      batch.set(doc(itemCollection, id), {
                        [label]: 0,
                      });

                      batch.set(doc(versionCollection, "version"), {
                        prevVersion: version?.version ?? "",
                        version: newVersion,
                      });

                      await batch.commit();
                    }}
                  >
                    add
                  </button>
                  <button
                    onClick={async () => {
                      await disableNetwork(firebase.firestore);
                    }}
                  >
                    offline
                  </button>
                  <button
                    onClick={async () => {
                      await enableNetwork(firebase.firestore);
                    }}
                  >
                    online
                  </button>
                  <For each={items$()}>{(item) => <p>{JSON.stringify(item)}</p>}</For>
                </>
              );
            })()}
          </Suspense>
        </FirebaseServiceProvoider>
      </>
    );
  },
};

declare module "@/services/firebase/firestore/schema" {
  interface Schema {
    pocFirestoreSnapshotTimingA: {
      text: string;
    };

    pocFirestoreSnapshotTimingB: {
      text: string;
    };
  }
}

export const FirestoreSnapshotTiming: StoryObj = {
  render() {
    const [errors$, setErrors] = createSignal([] as string[]);
    return (
      <>
        <pre>{errors$().join("\n")}</pre>

        <FirebaseServiceProvoider configYAML={firebaseConfig} setErrors={setErrors}>
          <Suspense fallback={<p>loading...</p>}>
            {(() => {
              const firebase = useFirebaseService();

              const colA = getCollection(firebase, "pocFirestoreSnapshotTimingA");
              const colB = getCollection(firebase, "pocFirestoreSnapshotTimingB");

              const a$ = createSubscribeSignal(() => doc(colA, "A"));
              const b$ = createSubscribeSignal(() => doc(colB, "B"));

              createComputed(() => {
                a$();
                console.timeStamp("computed A");
              });

              createComputed(() => {
                b$();
                console.timeStamp("computed B");
              });

              return (
                <>
                  <button
                    onClick={async () => {
                      const now = new Date().toISOString();

                      const batch = writeBatch(firebase.firestore);
                      batch.set(doc(colA, "A"), {
                        text: now,
                      });
                      batch.set(doc(colB, "B"), {
                        text: now,
                      });

                      console.timeStamp("before set A and B commit");

                      await Promise.race([
                        new Promise<void>((resolve) => {
                          const unsubscribe = onSnapshotsInSync(firebase.firestore, () => {
                            unsubscribe();
                            resolve();
                          });
                        }),
                        batch.commit().then(() => {
                          console.timeStamp("after set A and B commit");
                        }),
                      ]);

                      console.timeStamp("after set A and B process");
                    }}
                  >
                    modify A and B
                  </button>
                  <button
                    onClick={async () => {
                      console.timeStamp("before disable network");
                      await enableNetwork(firebase.firestore);
                      console.timeStamp("after disable network");
                    }}
                  >
                    online
                  </button>
                  <button
                    onClick={async () => {
                      console.timeStamp("before enable network");
                      await disableNetwork(firebase.firestore);
                      console.timeStamp("after enable network");
                    }}
                  >
                    offline
                  </button>
                  <p>{`A: ${a$()?.text}`}</p>
                  <p>{`B: ${b$()?.text}`}</p>
                </>
              );
            })()}
          </Suspense>
        </FirebaseServiceProvoider>
      </>
    );
  },
};
