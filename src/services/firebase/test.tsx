import { initializeApp } from "firebase/app";
import { type CollectionReference, collection, connectFirestoreEmulator, getFirestore } from "firebase/firestore";

import { type Schema } from "@/services/firebase/firestore/schema";

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
