import { render } from "@solidjs/testing-library";
import { doc, getDocs, Timestamp, writeBatch } from "firebase/firestore";
import { onMount, Suspense } from "solid-js";
import { describe, test, expect } from "vitest";

import { LifeLogs } from "@/panes/lifeLogs";
import { FirebaseServiceProvider } from "@/services/firebase";
import {
  FirestoreServiceProvider,
  getCollection,
  singletonDocumentId,
  useFirestoreService,
} from "@/services/firebase/firestore";
import { StoreServiceProvider, useStoreService } from "@/services/store";
import { noneTimestamp } from "@/timestamp";

describe("<LifeLogs />", () => {
  test("it renders lifelog data correctly", async () => {
    const result = render(() => (
      <StoreServiceProvider>
        <FirebaseServiceProvider
          configYAML={`{ apiKey: "apiKey", authDomain: "authDomain", projectId: "demo", storageBucket: "", messagingSenderId: "", appId: "", measurementId: "" }`}
          setErrors={() => {}}
        >
          <FirestoreServiceProvider>
            <Suspense fallback={<span>loading....</span>}>
              {(() => {
                const firestore = useFirestoreService();
                const batchVersion = getCollection(firestore, "batchVersion");
                const lifeLogs = getCollection(firestore, "lifeLogs");
                const lifeLogTreeNodes = getCollection(firestore, "lifeLogTreeNodes");
                const { updateState } = useStoreService();

                onMount(() => {
                  (async () => {
                    const batch = writeBatch(firestore.firestore);

                    for (const lifeLog of (await getDocs(lifeLogs)).docs) {
                      batch.delete(lifeLog.ref);
                    }

                    batch.set(doc(batchVersion, singletonDocumentId), {
                      version: "__INITIAL__",
                      prevVersion: "",
                      createdAt: Timestamp.fromDate(new Date()),
                      updatedAt: Timestamp.fromDate(new Date()),
                    });

                    batch.set(doc(lifeLogs, "$log1"), {
                      text: "test lifelog",
                      startAt: Timestamp.fromDate(new Date()),
                      endAt: noneTimestamp,
                      createdAt: Timestamp.fromDate(new Date()),
                      updatedAt: Timestamp.fromDate(new Date()),
                    });

                    batch.set(doc(lifeLogTreeNodes, "child1"), {
                      text: "test child1",
                      parentId: "$log1",
                      prevId: "",
                      nextId: "",
                      aboveId: "",
                      belowId: "",
                      createdAt: Timestamp.fromDate(new Date()),
                      updatedAt: Timestamp.fromDate(new Date()),
                    });

                    await batch.commit();

                    updateState((state) => {
                      state.panesLifeLogs.selectedLifeLogId = "$log1";
                    });
                  })().catch((error: unknown) => {
                    console.error("Error initializing Firestore data:", error);
                  });
                });

                return <LifeLogs />;
              })()}
            </Suspense>
          </FirestoreServiceProvider>
        </FirebaseServiceProvider>
      </StoreServiceProvider>
    ));

    const lifelogElement = await result.findByText("test lifelog");

    expect(lifelogElement).toBeTruthy();
    expect(result.getByText("N/A")).toBeTruthy();
  });
});
