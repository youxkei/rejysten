import type { Store as StoreWithId } from "@/services/rxdb/collections/store";
import type { JSXElement } from "solid-js";

import { produce } from "immer";
import { createRoot, useContext, createEffect, createContext } from "solid-js";
import { createStore, reconcile, unwrap } from "solid-js/store";

import { ServiceNotAvailable } from "@/services/error";
import { useRxDBService } from "@/services/rxdb";
import { createSubscribeSignal } from "@/services/rxdb/subscribe";
import { renderWithServicesForTest } from "@/services/test";

export type Store = Omit<StoreWithId, "id">;

const initialStore: Store = {
  mode: "normal",

  editor: {
    text: "",
    cursorPosition: -1,
  },

  currentPane: "actionLogList",
  actionLogListPane: {
    currentActionLogId: "",
    focus: "text",
  },
  actionLogPane: {
    currentActionLogId: "",
    currentListItemId: "",
  },
} as const;

export type StoreService = {
  store: Store;
  updateStore: (updater: (store: Store) => void) => Promise<void>;
};

const context = createContext<StoreService>();

export function StoreServiceProvider(props: { children: JSXElement }) {
  const { collections } = useRxDBService();

  const [store, setStore] = createStore<Store>(structuredClone(initialStore));

  async function updateStore(updater: (store: Store) => void) {
    await collections.stores.upsert({
      id: "const",
      ...produce(structuredClone(unwrap(store)), updater),
    });
  }

  const storeDocument$ = createSubscribeSignal(() => collections.stores.findOne("const"));

  createEffect(() => {
    const storeDocument = storeDocument$();
    if (!storeDocument) return;

    const { id: _, ...newStore } = storeDocument.toJSON();

    console.debug("update store", newStore);
    setStore(reconcile(newStore));
  });

  return <context.Provider value={{ store, updateStore }}>{props.children}</context.Provider>;
}

export function useStoreService() {
  const service = useContext(context);
  if (!service) throw new ServiceNotAvailable("Store");

  return service;
}

if (import.meta.vitest) {
  test("initial store", async (test) => {
    const {
      unmount,
      rxdb: { collections },
      store: { store },
    } = await renderWithServicesForTest(test.meta.id, (props) => props.children);

    test.expect(store).toEqual(initialStore);

    // there is no store document until the store is updated
    test.expect(await collections.stores.findOne("const").exec()).toBeNull();

    unmount();
  });

  test("update store from initial store", async (test) => {
    const {
      unmount,
      rxdb: { collections },
      store: { store, updateStore },
    } = await renderWithServicesForTest(test.meta.id, (props) => props.children);

    const storePromise = new Promise<string>((resolve) => {
      let initial = true;

      createRoot(() =>
        createEffect(() => {
          store.actionLogListPane.currentActionLogId;

          if (initial) {
            initial = false;
            return;
          }

          resolve(store.actionLogListPane.currentActionLogId);
        })
      );
    });

    const storeDocumentPromise = new Promise<string>((resolve) => {
      collections.stores.findOne("const").$.subscribe((storeDocument) => {
        if (!storeDocument) return;

        resolve(storeDocument.actionLogListPane.currentActionLogId);
      });
    });

    await updateStore((store) => {
      store.actionLogListPane.currentActionLogId = "placeholderActionLogId";
    });

    test.expect(await storePromise).toBe("placeholderActionLogId");
    test.expect(await storeDocumentPromise).toBe("placeholderActionLogId");

    unmount();
  });

  test("update store from non-initial store", async (test) => {
    const {
      unmount,
      rxdb: { collections },
      store: { store, updateStore },
    } = await renderWithServicesForTest(test.meta.id, (props) => props.children);

    await updateStore((store) => {
      store.actionLogListPane.currentActionLogId = "placeholderActionLogId";
    });

    await new Promise<void>((resolve) => {
      createRoot(() => {
        createEffect(() => {
          if (store.actionLogListPane.currentActionLogId === "placeholderActionLogId") {
            resolve();
          }
        });
      });
    });

    const storePromise = new Promise<{
      currentPane: string;
      currentListItemId: string;
    }>((resolve) => {
      let initial = true;

      createRoot(() =>
        createEffect(() => {
          store.actionLogPane.currentListItemId;

          if (initial) {
            initial = false;
            return;
          }

          resolve({
            currentPane: store.currentPane,
            currentListItemId: store.actionLogPane.currentListItemId,
          });
        })
      );
    });

    const storeDocumentPromise = new Promise<{
      currentPane: string;
      currentListItemId: string;
    }>((resolve) => {
      let initial = true;

      collections.stores.findOne("const").$.subscribe((storeDocument) => {
        if (!storeDocument) throw new Error("this should not happen");

        if (initial) {
          initial = false;
          return;
        }

        resolve({
          currentPane: storeDocument.currentPane,
          currentListItemId: storeDocument.actionLogPane.currentListItemId,
        });
      });
    });

    await updateStore((store) => {
      store.currentPane = "actionLog";
      store.actionLogPane.currentListItemId = "placeholderListItemId";
    });

    test.expect(await storePromise).toEqual({
      currentPane: "actionLog",
      currentListItemId: "placeholderListItemId",
    });
    test.expect(await storeDocumentPromise).toEqual({
      currentPane: "actionLog",
      currentListItemId: "placeholderListItemId",
    });

    unmount();
  });

  test("granular update notification", async (test) => {
    const {
      unmount,
      store: { store, updateStore },
    } = await renderWithServicesForTest(test.meta.id, (props) => props.children);

    const currentActionLogIdPromise = Promise.race([
      new Promise<string>((resolve) => {
        setTimeout(() => resolve("timeout"), 100);
      }),
      new Promise<string>((resolve) => {
        let initial = true;

        createRoot(() =>
          createEffect(() => {
            store.actionLogListPane.currentActionLogId;

            if (initial) {
              initial = false;
              return;
            }

            resolve("currentActionLogId updated");
          })
        );
      }),
    ]);

    const currentListItemIdPromise = Promise.race([
      new Promise<string>((resolve) => {
        setTimeout(() => resolve("timeout"), 100);
      }),
      new Promise<string>((resolve) => {
        let initial = true;

        createRoot(() =>
          createEffect(() => {
            store.actionLogPane.currentListItemId;

            if (initial) {
              initial = false;
              return;
            }

            resolve("currentListItemId updated");
          })
        );
      }),
    ]);

    await updateStore((store) => {
      store.actionLogListPane.currentActionLogId = "placeholderActionLogId";
    });

    test.expect(await currentActionLogIdPromise).toBe("currentActionLogId updated");
    test.expect(await currentListItemIdPromise).toBe("timeout");

    unmount();
  });
}
