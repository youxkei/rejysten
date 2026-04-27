import {
  type Firestore,
  setDoc,
  doc,
  Timestamp,
  initializeFirestore,
  getFirestore,
  persistentLocalCache,
  memoryLocalCache,
  connectFirestoreEmulator,
} from "firebase/firestore";

import { type SchemaCollectionReference } from "@/services/firebase/firestore";
import { type Schema } from "@/services/firebase/firestore/schema";
import { initializeApp, getApps } from "firebase/app";
import { createFirestoreClient } from "@/firestore/client";

export function createTestFirestoreService(
  emulatorPort: number,
  appName: string,
  options?: { useMemoryCache?: boolean },
) {
  const existingApps = getApps();
  let firebaseApp = existingApps.find((app) => app.name === appName);

  if (!firebaseApp) {
    firebaseApp = initializeApp(
      {
        apiKey: "apiKey",
        authDomain: "authDomain",
        projectId: "demo",
        storageBucket: "",
        messagingSenderId: "",
        appId: "",
        measurementId: "",
      },
      appName,
    );
  }

  let firestore: Firestore;
  try {
    firestore = initializeFirestore(
      firebaseApp,
      { localCache: options?.useMemoryCache ? memoryLocalCache() : persistentLocalCache() },
      "(default)",
    );
    connectFirestoreEmulator(firestore, "localhost", emulatorPort);
  } catch {
    firestore = getFirestore(firebaseApp);
  }

  return {
    firestore,
    firestoreClient: createFirestoreClient(firestore, {
      optimisticBatch: {
        ignoredFieldsForOverlay: ["createdAt", "updatedAt"],
      },
      snapshot: {
        ignoredFieldsForEquality: ["createdAt", "updatedAt"],
      },
    }),
    editHistoryHead$: () => undefined,
  };
}

export async function setDocs<C extends keyof Schema>(
  col: SchemaCollectionReference<C>,
  treeNodes: (Schema[C] & { text: string })[],
) {
  for (const treeNode of treeNodes) {
    await setDoc(doc(col, treeNode.text), treeNode);
  }
}

export const timestampForCreatedAt = Timestamp.fromDate(new Date("2123-04-05T06:07:08+09:00"));
export const timestampForServerTimestamp = Timestamp.fromDate(new Date("2345-06-07T08:09:10+09:00"));
