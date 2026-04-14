import {
  type CollectionReference,
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
import { initializeApp, getApps } from "firebase/app";

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

  return { firestore, editHistoryHead$: () => undefined };
}

export async function setDocs<T extends { text: string }>(col: CollectionReference<T>, treeNodes: T[]) {
  for (const treeNode of treeNodes) {
    await setDoc(doc(col, treeNode.text), treeNode);
  }
}

export const timestampForCreatedAt = Timestamp.fromDate(new Date("2123-04-05T06:07:08+09:00"));
export const timestampForServerTimestamp = Timestamp.fromDate(new Date("2345-06-07T08:09:10+09:00"));
