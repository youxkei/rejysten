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
  orderBy,
} from "firebase/firestore";
import {
  For,
  Suspense,
  createSignal,
  createMemo,
  Show,
  startTransition,
  createComputed,
  type JSXElement,
} from "solid-js";
import { type Meta, type StoryObj } from "storybook-solidjs-vite";
import { uuidv7 } from "uuidv7";
import XRegExp from "xregexp";

import { FirebaseServiceProvider } from "@/services/firebase";
import { FirestoreServiceProvider, getCollection, useFirestoreService } from "@/services/firebase/firestore";
import { createSubscribeAllSignal, createSubscribeSignal } from "@/services/firebase/firestore/subscribe";
import { StoreServiceProvider } from "@/services/store";
import { dumpSignal } from "@/solid/signal";

export default {
  title: "services/firestore",
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

const nonPrintableUnicodeRegex = XRegExp("[\\p{C}\\p{Z}]", "g");
const segmenter = new Intl.Segmenter();

function split(text: string) {
  const segmented = segmenter.segment(text);

  return [...segmented[Symbol.iterator]().map((segment) => segment.segment)];
}

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
    return (
      <StoreServiceProvider>
        <StorybookFirebaseWrapper>
          <Suspense fallback={<p>loading...</p>}>
            {(() => {
              const firestore = useFirestoreService();

              const [text$, setText] = createSignal("");
              const [searchText$, setSearchText] = createSignal("");
              const searchTextChars$ = createMemo(() => split(trimNonPrintableChars(searchText$())), []);

              const itemCollection = getCollection(firestore, "pocFirestoreNgramItems");
              const bigramCollection = getCollection(firestore, "pocFirestoreNgrams");

              const items$ = createSubscribeAllSignal(firestore, () => itemCollection);

              const serchedItems$ = createSubscribeAllSignal(firestore, () => {
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
                          const batch = writeBatch(firestore.firestore);
                          const id = uuidv7();

                          batch.set(doc(itemCollection, id), {
                            text,
                          });

                          batch.set(doc(bigramCollection, id), {
                            collection: "pocFirestoreNgramItems",
                            text,
                            ngram: calcBigram(split(trimNonPrintableChars(text))),
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
        </StorybookFirebaseWrapper>
      </StoreServiceProvider>
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
    return (
      <StoreServiceProvider>
        <StorybookFirebaseWrapper>
          {(() => {
            const firestore = useFirestoreService();

            const itemCollection = getCollection(firestore, "pocFirestorePubsub");

            return (
              <>
                <button
                  onClick={async () => {
                    const batch = writeBatch(firestore.firestore);

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

                      await runTransaction(firestore.firestore, async (transaction) => {
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
        </StorybookFirebaseWrapper>
      </StoreServiceProvider>
    );
  },
};

export const FirestoreSubscribe: StoryObj = {
  render() {
    return (
      <StoreServiceProvider>
        <StorybookFirebaseWrapper>
          <Suspense fallback={<p>loading...</p>}>
            {(() => {
              const firestore = useFirestoreService();
              const itemCollection = getCollection(firestore, "pocFirestorePubsub");
              const items$ = dumpSignal(createSubscribeAllSignal(firestore, () => itemCollection));
              return (
                <>
                  <p>items:</p>
                  <For each={items$()}>{(item) => <p>{item.id}</p>}</For>
                </>
              );
            })()}
          </Suspense>
        </StorybookFirebaseWrapper>
      </StoreServiceProvider>
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
    return (
      <StoreServiceProvider>
        <StorybookFirebaseWrapper>
          <Suspense fallback={<p>loading...</p>}>
            {(() => {
              const firestore = useFirestoreService();
              const itemCollection = getCollection(firestore, "pocFirestoreSubcollection");
              const id = uuidv7();

              return (
                <>
                  <button
                    onClick={async () => {
                      const batch = writeBatch(firestore.firestore);

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
                      const batch = writeBatch(firestore.firestore);

                      batch.delete(doc(itemCollection, id));

                      await batch.commit();
                    }}
                  >
                    delete doc
                  </button>
                  <button
                    onClick={async () => {
                      const batch = writeBatch(firestore.firestore);

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
        </StorybookFirebaseWrapper>
      </StoreServiceProvider>
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
    return (
      <StoreServiceProvider>
        <StorybookFirebaseWrapper>
          <Suspense fallback={<p>loading...</p>}>
            {(() => {
              const firestore = useFirestoreService();

              const [label$, setLabel] = createSignal("");

              const versionCollection = getCollection(firestore, "pocFirestoreRulesVersion");
              const itemCollection = getCollection(firestore, "pocFirestoreRulesItems");

              const version$ = createSubscribeSignal(firestore, () => doc(versionCollection, "version"));
              const items$ = createSubscribeAllSignal(firestore, () => itemCollection);

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

                      const batch = writeBatch(firestore.firestore);

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
                      await disableNetwork(firestore.firestore);
                    }}
                  >
                    offline
                  </button>
                  <button
                    onClick={async () => {
                      await enableNetwork(firestore.firestore);
                    }}
                  >
                    online
                  </button>
                  <For each={items$()}>{(item) => <p>{JSON.stringify(item)}</p>}</For>
                </>
              );
            })()}
          </Suspense>
        </StorybookFirebaseWrapper>
      </StoreServiceProvider>
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
    return (
      <StoreServiceProvider>
        <StorybookFirebaseWrapper>
          <Suspense fallback={<p>loading...</p>}>
            {(() => {
              const firestore = useFirestoreService();

              const colA = getCollection(firestore, "pocFirestoreSnapshotTimingA");
              const colB = getCollection(firestore, "pocFirestoreSnapshotTimingB");

              const a$ = createSubscribeSignal(firestore, () => doc(colA, "A"));
              const b$ = createSubscribeSignal(firestore, () => doc(colB, "B"));

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

                      const batch = writeBatch(firestore.firestore);
                      batch.set(doc(colA, "A"), {
                        text: now,
                      });
                      batch.set(doc(colB, "B"), {
                        text: now,
                      });

                      console.timeStamp("before set A and B commit");

                      await Promise.race([
                        new Promise<void>((resolve) => {
                          firestore.resolve = resolve;
                        }).then(() => {
                          console.timeStamp("global onSnapshotsInSync fired");
                        }),
                        batch.commit().then(() => {
                          console.timeStamp("write batch promise resolved");
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
                      await enableNetwork(firestore.firestore);
                      console.timeStamp("after disable network");
                    }}
                  >
                    online
                  </button>
                  <button
                    onClick={async () => {
                      console.timeStamp("before enable network");
                      await disableNetwork(firestore.firestore);
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
        </StorybookFirebaseWrapper>
      </StoreServiceProvider>
    );
  },
};

declare module "@/services/firebase/firestore/schema" {
  interface Schema {
    pocFirestoreIndexOrderItems: {
      startAt: number;
      endAt: number;
    };
  }
}

export const IndexOrder: StoryObj = {
  /*
   * result:
   * - where("startAt", ">=", 1), where("endAt", "<=", 10), orderBy("startAt"), orderBy("endAt")
   *   - startAt, endAt
   * - where("endAt", "<=", 10), where("startAt", ">=", 1), orderBy("endAt"), orderBy("startAt")
   *   - endAt, startAt
   * - where("startAt", ">=", 1), where("endAt", "<=", 10)
   *   - endAt, startAt
   * - where("startAt", ">=", 1), where("endAt", "<=", 10), orderBy("endAt"), orderBy("startAt")
   *   - endAt, startAt
   * - where("endAt", "<=", 10), where("startAt", ">=", 1)
   *   - endAt, startAt
   */
  render: () => {
    return (
      <StoreServiceProvider>
        <StorybookFirebaseWrapper>
          <Suspense>
            {(() => {
              const firestoreService = useFirestoreService();
              const [results, setResults] = createSignal<{ id: string; startAt: number; endAt: number }[]>([]);

              const addTestData = async () => {
                const batch = writeBatch(firestoreService.firestore);
                const collectionRef = getCollection(firestoreService, "pocFirestoreIndexOrderItems");

                // Create test documents with various startAt and endAt values
                const testData = [
                  { id: "1", startAt: 1, endAt: 5 },
                  { id: "2", startAt: 2, endAt: 3 },
                  { id: "3", startAt: 1, endAt: 10 },
                  { id: "4", startAt: 3, endAt: 7 },
                  { id: "5", startAt: 2, endAt: 8 },
                  { id: "6", startAt: 2, endAt: 8 },
                ];

                for (const data of testData) {
                  const docRef = doc(collectionRef, data.id);
                  batch.set(docRef, data);
                }

                await batch.commit();
              };

              const queryData = async () => {
                const collectionRef = getCollection(firestoreService, "pocFirestoreIndexOrderItems");
                const q = query(
                  collectionRef,
                  where("startAt", ">=", 1),
                  where("endAt", "<=", 10),
                  orderBy("startAt"),
                  orderBy("endAt"),
                );

                const snapshot = await getDocs(q);
                const docs = snapshot.docs.map((doc) => ({
                  id: doc.id,
                  ...doc.data(),
                }));

                setResults(docs);
              };

              const queryDataReversed = async () => {
                const collectionRef = getCollection(firestoreService, "pocFirestoreIndexOrderItems");
                const q = query(
                  collectionRef,
                  where("endAt", "<=", 10),
                  where("startAt", ">=", 1),
                  orderBy("endAt"),
                  orderBy("startAt"),
                );

                const snapshot = await getDocs(q);
                const docs = snapshot.docs.map((doc) => ({
                  id: doc.id,
                  ...doc.data(),
                }));

                setResults(docs);
              };

              const queryDataNoOrderBy = async () => {
                const collectionRef = getCollection(firestoreService, "pocFirestoreIndexOrderItems");
                const q = query(collectionRef, where("startAt", ">=", 1), where("endAt", "<=", 10));

                const snapshot = await getDocs(q);
                const docs = snapshot.docs.map((doc) => ({
                  id: doc.id,
                  ...doc.data(),
                }));

                setResults(docs);
              };

              const queryDataReverseOrder = async () => {
                const collectionRef = getCollection(firestoreService, "pocFirestoreIndexOrderItems");
                const q = query(
                  collectionRef,
                  where("startAt", ">=", 1),
                  where("endAt", "<=", 10),
                  orderBy("endAt"),
                  orderBy("startAt"),
                );

                const snapshot = await getDocs(q);
                const docs = snapshot.docs.map((doc) => ({
                  id: doc.id,
                  ...doc.data(),
                }));

                setResults(docs);
              };

              const queryDataReverseNoOrderBy = async () => {
                const collectionRef = getCollection(firestoreService, "pocFirestoreIndexOrderItems");
                const q = query(collectionRef, where("endAt", "<=", 10), where("startAt", ">=", 1));

                const snapshot = await getDocs(q);
                const docs = snapshot.docs.map((doc) => ({
                  id: doc.id,
                  ...doc.data(),
                }));

                setResults(docs);
              };

              const deleteTestData = async () => {
                const collectionRef = getCollection(firestoreService, "pocFirestoreIndexOrderItems");
                const snapshot = await getDocs(collectionRef);

                const batch = writeBatch(firestoreService.firestore);
                snapshot.docs.forEach((doc) => {
                  batch.delete(doc.ref);
                });

                await batch.commit();
                setResults([]);
              };

              return (
                <>
                  <h3>Firestore Index Order Test</h3>
                  <p>Index: startAt (ASC), endAt (ASC)</p>

                  <button onClick={addTestData}>Add Test Data</button>

                  <button onClick={queryData}>Query with index</button>

                  <button onClick={queryDataReversed}>Query with reversed fields</button>

                  <button onClick={queryDataNoOrderBy}>Query without orderBy</button>

                  <button onClick={queryDataReverseOrder}>Query with reversed orderBy</button>

                  <button onClick={queryDataReverseNoOrderBy}>Query reversed without orderBy</button>

                  <button onClick={deleteTestData}>Delete Test Data</button>

                  <h4>Results:</h4>
                  <table>
                    <thead>
                      <tr>
                        <th>Document ID</th>
                        <th>startAt</th>
                        <th>endAt</th>
                      </tr>
                    </thead>
                    <tbody>
                      <For each={results()}>
                        {(item) => (
                          <tr>
                            <td>{item.id}</td>
                            <td>{item.startAt}</td>
                            <td>{item.endAt}</td>
                          </tr>
                        )}
                      </For>
                    </tbody>
                  </table>

                  <p>
                    Expected order: Documents are sorted by startAt (ascending), then by endAt (ascending) for same
                    startAt values
                  </p>
                </>
              );
            })()}
          </Suspense>
        </StorybookFirebaseWrapper>
      </StoreServiceProvider>
    );
  },
};

declare module "@/services/firebase/firestore/schema" {
  interface Schema {
    pocSingleFieldIndexOrder: {
      field1: string;
      field2: string;
      value: number;
    };
  }
}

export const SingleFieldIndexOrder: StoryObj = {
  /*
   * result: can order by __name__ asc and desc
   */
  render: () => {
    return (
      <StoreServiceProvider>
        <StorybookFirebaseWrapper>
          <Suspense>
            {(() => {
              const firestoreService = useFirestoreService();
              const [results, setResults] = createSignal<
                { id: string; field1: string; field2: string; value: number }[]
              >([]);
              const [error, setError] = createSignal<string | null>(null);

              const addTestData = async () => {
                const collectionRef = getCollection(firestoreService, "pocSingleFieldIndexOrder");

                const batch = writeBatch(firestoreService.firestore);

                // Create documents with specific IDs to test __name__ ordering
                const testData = [
                  { id: "doc_a", field1: "apple", field2: "red", value: 10 },
                  { id: "doc_b", field1: "apple", field2: "red", value: 30 },
                  { id: "doc_c", field1: "apple", field2: "red", value: 20 },
                  { id: "doc_d", field1: "apple", field2: "red", value: 40 },
                  { id: "doc_e", field1: "banana", field2: "yellow", value: 50 },
                ];

                testData.forEach(({ id, ...data }) => {
                  const docRef = doc(collectionRef, id);
                  batch.set(docRef, data);
                });

                await batch.commit();
                setError(null);
              };

              const queryWithNameOrder = async () => {
                try {
                  const collectionRef = getCollection(firestoreService, "pocSingleFieldIndexOrder");
                  // Query with multiple equality conditions and order by __name__
                  const q = query(
                    collectionRef,
                    where("field1", "==", "apple"),
                    where("field2", "==", "red"),
                    orderBy("__name__"),
                  );

                  const snapshot = await getDocs(q);
                  const docs = snapshot.docs.map((doc) => ({
                    id: doc.id,
                    ...doc.data(),
                  }));

                  setResults(docs);
                  setError(null);
                } catch (err) {
                  setError(err instanceof Error ? err.message : String(err));
                  setResults([]);
                }
              };

              const queryWithNameOrderDesc = async () => {
                try {
                  const collectionRef = getCollection(firestoreService, "pocSingleFieldIndexOrder");
                  // Query with multiple equality conditions and order by __name__ in descending order
                  const q = query(
                    collectionRef,
                    where("field1", "==", "apple"),
                    where("field2", "==", "red"),
                    orderBy("__name__", "desc"),
                  );

                  const snapshot = await getDocs(q);
                  const docs = snapshot.docs.map((doc) => ({
                    id: doc.id,
                    ...doc.data(),
                  }));

                  setResults(docs);
                  setError(null);
                } catch (err) {
                  setError(err instanceof Error ? err.message : String(err));
                  setResults([]);
                }
              };

              const queryWithoutOrder = async () => {
                try {
                  const collectionRef = getCollection(firestoreService, "pocSingleFieldIndexOrder");
                  // Query with multiple equality conditions without ordering
                  const q = query(collectionRef, where("field1", "==", "apple"), where("field2", "==", "red"));

                  const snapshot = await getDocs(q);
                  const docs = snapshot.docs.map((doc) => ({
                    id: doc.id,
                    ...doc.data(),
                  }));

                  setResults(docs);
                  setError(null);
                } catch (err) {
                  setError(err instanceof Error ? err.message : String(err));
                  setResults([]);
                }
              };

              const queryWithValueOrder = async () => {
                try {
                  const collectionRef = getCollection(firestoreService, "pocSingleFieldIndexOrder");
                  // Query with multiple equality conditions and order by value
                  const q = query(
                    collectionRef,
                    where("field1", "==", "apple"),
                    where("field2", "==", "red"),
                    orderBy("value"),
                  );

                  const snapshot = await getDocs(q);
                  const docs = snapshot.docs.map((doc) => ({
                    id: doc.id,
                    ...doc.data(),
                  }));

                  setResults(docs);
                  setError(null);
                } catch (err) {
                  setError(err instanceof Error ? err.message : String(err));
                  setResults([]);
                }
              };

              const deleteTestData = async () => {
                const collectionRef = getCollection(firestoreService, "pocSingleFieldIndexOrder");
                const snapshot = await getDocs(collectionRef);

                const batch = writeBatch(firestoreService.firestore);
                snapshot.docs.forEach((doc) => {
                  batch.delete(doc.ref);
                });

                await batch.commit();
                setResults([]);
                setError(null);
              };

              return (
                <>
                  <h3>Single Field Index with __name__ Order Test</h3>
                  <p>
                    Test if Firestore's auto-generated single field indexes support ordering by __name__ with multiple
                    equality where conditions
                  </p>

                  <button onClick={addTestData}>Add Test Data</button>
                  <button onClick={queryWithNameOrder}>Query with orderBy("__name__")</button>
                  <button onClick={queryWithNameOrderDesc}>Query with orderBy("__name__", "desc")</button>
                  <button onClick={queryWithoutOrder}>Query without orderBy</button>
                  <button onClick={queryWithValueOrder}>Query with orderBy("value")</button>
                  <button onClick={deleteTestData}>Delete Test Data</button>

                  {error() && (
                    <div style={{ color: "red", "margin-top": "10px" }}>
                      <strong>Error:</strong> {error()}
                    </div>
                  )}

                  <h4>Results:</h4>
                  <table>
                    <thead>
                      <tr>
                        <th>Document ID</th>
                        <th>field1</th>
                        <th>field2</th>
                        <th>value</th>
                      </tr>
                    </thead>
                    <tbody>
                      {results().map((doc) => (
                        <tr>
                          <td>{doc.id}</td>
                          <td>{doc.field1}</td>
                          <td>{doc.field2}</td>
                          <td>{doc.value}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </>
              );
            })()}
          </Suspense>
        </StorybookFirebaseWrapper>
      </StoreServiceProvider>
    );
  },
};
