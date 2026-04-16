import { doc, Timestamp, writeBatch } from "firebase/firestore";
import { createSignal, onMount, Show, Suspense } from "solid-js";
import { type Meta, type StoryObj } from "storybook-solidjs-vite";

import { App } from "@/app";
import { FirebaseServiceProvider } from "@/services/firebase";
import {
  FirestoreServiceProvider,
  getCollection,
  singletonDocumentId,
  useFirestoreService,
} from "@/services/firebase/firestore";
import { StoreServiceProvider } from "@/services/store";
import { noneTimestamp } from "@/timestamp";

export default {
  title: "App",
  parameters: {
    layout: "fullscreen",
  },
} satisfies Meta;

const EMULATOR_PORT = 8080;
const firebaseConfig = `{ apiKey: "apiKey", authDomain: "authDomain", projectId: "demo", storageBucket: "", messagingSenderId: "", appId: "", measurementId: "", projectNumber: "", version: "2" }`;
const storagePostfix = ".story";
const seedPostfix = ".story-seed";

function seedStore() {
  localStorage.setItem(
    `rejysten.service.store.state${storagePostfix}`,
    JSON.stringify({
      version: 3,
      state: { firebase: { configYAML: firebaseConfig } },
    }),
  );
}

function Seeder(props: { onReady: () => void }) {
  const firestore = useFirestoreService();
  const batchVersion = getCollection(firestore, "batchVersion");
  const lifeLogs = getCollection(firestore, "lifeLogs");
  const lifeLogTreeNodes = getCollection(firestore, "lifeLogTreeNodes");

  onMount(() => {
    (async () => {
      await fetch(
        `http://localhost:${EMULATOR_PORT}/emulator/v1/projects/demo/databases/(default)/documents`,
        { method: "DELETE" },
      );

      const now = new Date();
      const batch = writeBatch(firestore.firestore);

      batch.set(doc(batchVersion, singletonDocumentId), {
        version: "__INITIAL__",
        prevVersion: "",
        createdAt: Timestamp.fromDate(now),
        updatedAt: Timestamp.fromDate(now),
      });

      const start = new Date(now);
      start.setHours(9, 0, 0, 0);
      batch.set(doc(lifeLogs, "$log1"), {
        text: "first lifelog",
        hasTreeNodes: true,
        startAt: Timestamp.fromDate(start),
        endAt: noneTimestamp,
        createdAt: Timestamp.fromDate(now),
        updatedAt: Timestamp.fromDate(now),
      });

      for (let i = 0; i < 6; i++) {
        batch.set(doc(lifeLogTreeNodes, `child${i}`), {
          text: `child ${i}`,
          lifeLogId: "$log1",
          parentId: "$log1",
          order: `a${i}`,
          createdAt: Timestamp.fromDate(now),
          updatedAt: Timestamp.fromDate(now),
        });
      }

      await batch.commit();
    })()
      .catch((e: unknown) => {
        console.error("Failed to seed Firestore", e);
      })
      .finally(props.onReady);
  });

  return null;
}

export const Default: StoryObj = {
  render() {
    const [ready, setReady] = createSignal(false);

    seedStore();

    return (
      <>
        <Show when={!ready()}>
          <StoreServiceProvider localStorageNamePostfix={seedPostfix}>
            <FirebaseServiceProvider
              configYAML={firebaseConfig}
              setErrors={() => undefined}
              appName="AppStorySeed"
            >
              <FirestoreServiceProvider emulatorPort={EMULATOR_PORT} useMemoryCache>
                <Suspense>
                  <Seeder onReady={() => setReady(true)} />
                </Suspense>
              </FirestoreServiceProvider>
            </FirebaseServiceProvider>
          </StoreServiceProvider>
        </Show>
        <Show when={ready()}>
          <App
            localStorageNamePostfix={storagePostfix}
            firestoreEmulatorPort={EMULATOR_PORT}
            firebaseAppName="AppStory"
            firestoreUseMemoryCache
          />
        </Show>
      </>
    );
  },
};
