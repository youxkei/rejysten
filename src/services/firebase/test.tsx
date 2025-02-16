import { initializeApp } from "firebase/app";

import { type FirebaseService } from ".";

function createFirebaseServiceForTest(): FirebaseService {
  const firebaseApp = initializeApp({
    apiKey: "apiKey",
    authDomain: "authDomain",
    projectId: "demo",
    storageBucket: "",
    messagingSenderId: "",
    appId: "",
    measurementId: "",
  });

  return { firebaseApp };
}

export const firebaseServiceForTest = createFirebaseServiceForTest();
