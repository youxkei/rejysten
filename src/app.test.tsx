import { cleanup, render } from "@solidjs/testing-library";
import { doc, Timestamp, writeBatch } from "firebase/firestore";
import { onMount, Suspense } from "solid-js";
import { afterAll, afterEach, beforeAll, describe, expect, vi } from "vitest";
import { page, userEvent } from "vitest/browser";

import { App } from "@/app";
import { awaitPendingCallbacks } from "@/awaitableCallback";
import { baseTime } from "@/panes/lifeLogs/test";
import { FirebaseServiceProvider } from "@/services/firebase";
import {
  FirestoreServiceProvider,
  getCollection,
  singletonDocumentId,
  useFirestoreService,
} from "@/services/firebase/firestore";
import { StoreServiceProvider } from "@/services/store";
import { styles } from "@/styles.css";
import { acquireEmulator, releaseEmulator, testWithDb as it, type DatabaseInfo } from "@/test";
import { noneTimestamp } from "@/timestamp";

vi.mock(import("@/date"), async () => {
  return {
    NewDate: () => baseTime,
    DateNow: () => baseTime.getTime(),
    TimestampNow: () => Timestamp.fromDate(baseTime),
  };
});

vi.mock(import("virtual:pwa-register"), async () => {
  return {
    registerSW: () => () => Promise.resolve(),
  };
});

beforeAll(async () => {
  await acquireEmulator();
});

afterAll(async () => {
  await releaseEmulator();
});

afterEach(async () => {
  await awaitPendingCallbacks();
  cleanup();
});

const testConfigYAML = `{ apiKey: "apiKey", authDomain: "authDomain", projectId: "demo", storageBucket: "", messagingSenderId: "", appId: "", measurementId: "", projectNumber: "", version: "2" }`;

async function setupAppTest(testId: string, db: DatabaseInfo) {
  localStorage.setItem(
    `rejysten.service.store.state${testId}`,
    JSON.stringify({
      version: 3,
      state: { firebase: { configYAML: testConfigYAML } },
    }),
  );

  let resolveReady: () => void;
  let rejectReady: (error: unknown) => void;
  const ready = new Promise<void>((resolve, reject) => {
    resolveReady = resolve;
    rejectReady = reject;
  });

  const seedRender = render(() => (
    <StoreServiceProvider localStorageNamePostfix={`${testId}-seed`}>
      <FirebaseServiceProvider configYAML={testConfigYAML} setErrors={() => undefined} appName={`${testId}-seed`}>
        <FirestoreServiceProvider emulatorPort={db.emulatorPort} useMemoryCache>
          <Suspense>
            {(() => {
              const firestore = useFirestoreService();
              onMount(() => {
                (async () => {
                  const batch = writeBatch(firestore.firestore);
                  const batchVersion = getCollection(firestore, "batchVersion");
                  const lifeLogs = getCollection(firestore, "lifeLogs");

                  batch.set(doc(batchVersion, singletonDocumentId), {
                    version: "__INITIAL__",
                    prevVersion: "",
                    createdAt: Timestamp.fromDate(baseTime),
                    updatedAt: Timestamp.fromDate(baseTime),
                  });

                  const startTime = new Date(baseTime);
                  startTime.setHours(10, 0, 0, 0);
                  batch.set(doc(lifeLogs, "$log1"), {
                    text: "first lifelog",
                    hasTreeNodes: false,
                    startAt: Timestamp.fromDate(startTime),
                    endAt: noneTimestamp,
                    createdAt: Timestamp.fromDate(baseTime),
                    updatedAt: Timestamp.fromDate(baseTime),
                  });

                  await batch.commit();
                })().then(resolveReady, rejectReady);
              });
              return null;
            })()}
          </Suspense>
        </FirestoreServiceProvider>
      </FirebaseServiceProvider>
    </StoreServiceProvider>
  ));

  await ready;
  seedRender.unmount();
  localStorage.removeItem(`rejysten.service.store.state${testId}-seed`);

  const result = render(() => (
    <App
      localStorageNamePostfix={testId}
      firestoreEmulatorPort={db.emulatorPort}
      firestoreUseMemoryCache
      firebaseAppName={testId}
    />
  ));

  result.container.style.height = "100%";

  await result.findByText("first lifelog");
  const toolbar = result.container.querySelector<HTMLElement>(`.${styles.mobileToolbar.container}`)!;

  return { result, toolbar };
}

describe("<App />", () => {
  describe("mobile toolbar positioning", () => {
    it("toolbar is pinned to the bottom of app.main on mobile", async ({ db, task }) => {
      await page.viewport(414, 896);
      const { toolbar } = await setupAppTest(task.id, db);

      const toolbarRect = toolbar.getBoundingClientRect();
      const mainRect = document.querySelector(`.${styles.app.main}`)!.getBoundingClientRect();
      // Toolbar should sit at the bottom edge of app.main (the full-height content area)
      expect(mainRect.bottom - toolbarRect.bottom).toBeLessThan(2);
    });

    it("search pane does not cause horizontal overflow of app.main on mobile", async ({ db, task }) => {
      await page.viewport(414, 896);
      await setupAppTest(task.id, db);

      await userEvent.keyboard("/");
      await userEvent.keyboard("{Escape}");
      await awaitPendingCallbacks();

      const mainEl = document.querySelector<HTMLElement>(`.${styles.app.main}`)!;
      // The search pane's focused input must not push app.main's content past its content box,
      // otherwise browsers auto-scroll the overflow container and shift the entire layout left.
      expect(mainEl.scrollLeft).toBe(0);
      expect(mainEl.scrollWidth).toBe(mainEl.clientWidth);
    });
  });

  describe("search pane keyboard activation", () => {
    it("Slash key opens Search pane and Escape returns to LifeLogs", async ({ db, task }) => {
      await page.viewport(414, 896);
      const { result } = await setupAppTest(task.id, db);

      await userEvent.keyboard("/");
      await awaitPendingCallbacks();
      const searchInput = result.container.querySelector<HTMLInputElement>(`.${styles.search.input}`);
      expect(searchInput).not.toBeNull();
      expect(document.activeElement).toBe(searchInput);

      // First Escape blurs the input, second Escape closes the pane (matches src/panes/search/search.tsx behavior)
      await userEvent.keyboard("{Escape}");
      await userEvent.keyboard("{Escape}");
      await awaitPendingCallbacks();
      expect(result.container.querySelector(`.${styles.search.input}`)).toBeNull();
      expect(result.queryByText("first lifelog")).not.toBeNull();
    });
  });
});
