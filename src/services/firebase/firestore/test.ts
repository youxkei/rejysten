import {
  type CollectionReference,
  setDoc,
  doc,
  Timestamp,
  initializeFirestore,
  persistentLocalCache,
  connectFirestoreEmulator,
} from "firebase/firestore";
import { initializeApp, getApps } from "firebase/app";

export function createTestFirestoreService(emulatorPort: number, appName: string) {
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

  const firestore = initializeFirestore(firebaseApp, { localCache: persistentLocalCache() }, "test");

  connectFirestoreEmulator(firestore, "localhost", emulatorPort);

  return { firestore };
}

export async function setDocs<T extends { text: string }>(col: CollectionReference<T>, treeNodes: T[]) {
  for (const treeNode of treeNodes) {
    await setDoc(doc(col, treeNode.text), treeNode);
  }
}

export const timestampForCreatedAt = Timestamp.fromDate(new Date("2123-04-05T06:07:08+09:00"));
export const timestampForServerTimestamp = Timestamp.fromDate(new Date("2345-06-07T08:09:10+09:00"));
