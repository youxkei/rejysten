import type { Schema } from "@/services/firebase/firestore/schema";
import type { CollectionReference } from "firebase/firestore";

import { initializeApp } from "firebase/app";
import { collection, connectFirestoreEmulator, getFirestore } from "firebase/firestore";

export function createFirebaseServiceForTest() {
  const app = initializeApp({
    apiKey: "apiKey",
    authDomain: "authDomain",
    projectId: "demo",
    storageBucket: "",
    messagingSenderId: "",
    appId: "",
    measurementId: "",
  });

  const firestore = getFirestore(app);

  connectFirestoreEmulator(firestore, "localhost", 8080);

  return { firestore };
}

export const firebaseServiceForTest = createFirebaseServiceForTest();
export const firestoreForTest = firebaseServiceForTest.firestore;

export function getCollectionForTest<Name extends keyof Schema>(name: Name, postfix: string) {
  return collection(firebaseServiceForTest.firestore, `${name}_${postfix}`) as CollectionReference<Schema[Name]>;
}
