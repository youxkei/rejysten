import type { Collections } from "@/services/rxdb/collections";
import type { Store as StoreWithId } from "@/services/rxdb/collections/store";
import type { JSXElement } from "solid-js";

import { produce } from "immer";
import { createRoot, useContext, createEffect, createContext } from "solid-js";
import { createStore, reconcile } from "solid-js/store";

import { useRxDBService } from "@/services/rxdb";
import { createSubscribeSignal } from "@/services/rxdb/subscribe";
import { RxDBServiceProviderForTest } from "@/services/rxdb/test";
import { renderAsync } from "@/test";

export type Store = Omit<StoreWithId, "id">;

const initialStore: Store = {
  currentPane: "actionLogList",
  actionLogListPane: {
    currentActionLogId: "",
  },
  actionLogPane: {
    currentListItemId: "",
  },
} as const;

export type StoreService = {
  store: Store;
  updateStore$: () => ((updater: (store: Store) => void) => void) | undefined;
};

const context = createContext<StoreService>();

export function StoreServiceProvider(props: { children: JSXElement }) {
  const { collections } = useRxDBService();

  const [store, setStore] = createStore<Store>(structuredClone(initialStore));

  const storeDocument$ = createSubscribeSignal(() => collections.stores.findOne("const"));

  const updateStore$ = () => {
    const storeDocument = storeDocument$();
    if (storeDocument === undefined) return;

    return (updater: (store: Store) => void) => {
      if (storeDocument) {
        storeDocument.patch(produce(storeDocument.toJSON(), updater));
      } else {
        collections.stores.insert({ id: "const", ...produce(initialStore, updater) });
      }
    };
  };

  createEffect(() => {
    const storeDocument = storeDocument$();
    if (!storeDocument) return;

    const { id: _, ...newStore } = storeDocument.toJSON();
    setStore(reconcile(newStore));
  });

  return <context.Provider value={{ store, updateStore$ }}>{props.children}</context.Provider>;
}

export function useStoreService() {
  const service = useContext(context);
  if (!service) throw new Error("useStoreService must be used within a StoreServiceProvider");

  return service;
}

if (import.meta.vitest) {
  test("initial store", async (test) => {
    const { unmount, store } = await renderAsync(
      (props) => (
        <RxDBServiceProviderForTest tid={test.meta.id}>
          <StoreServiceProvider>{props.children}</StoreServiceProvider>
        </RxDBServiceProviderForTest>
      ),
      (resolve: (value: { store: Store }) => void) => {
        const { store } = useStoreService();

        resolve({ store });
      }
    );

    test.expect(store).toEqual(initialStore);

    unmount();
  });

  test("update store from initial store", async (test) => {
    const { unmount, collections, store, updateStore } = await renderAsync(
      (props) => (
        <RxDBServiceProviderForTest tid={test.meta.id}>
          <StoreServiceProvider>{props.children}</StoreServiceProvider>
        </RxDBServiceProviderForTest>
      ),
      (resolve: (value: { collections: Collections; store: Store; updateStore: (updater: (store: Store) => void) => void }) => void) => {
        const { collections } = useRxDBService();

        const { store, updateStore$ } = useStoreService();
        const updateStore = updateStore$();
        if (!updateStore) return;

        resolve({ collections, store, updateStore });
      }
    );

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

    updateStore((store) => {
      store.actionLogListPane.currentActionLogId = "placeholderActionLogId";
    });

    test.expect(await storePromise).toBe("placeholderActionLogId");
    test.expect(await storeDocumentPromise).toBe("placeholderActionLogId");

    unmount();
  });

  test("update store from non-initial store", async (test) => {
    const { unmount, collections, store, updateStore } = await renderAsync(
      (props) => (
        <RxDBServiceProviderForTest tid={test.meta.id}>
          <StoreServiceProvider>{props.children}</StoreServiceProvider>
        </RxDBServiceProviderForTest>
      ),
      (resolve: (value: { collections: Collections; store: Store; updateStore: (updater: (store: Store) => void) => void }) => void) => {
        const { collections } = useRxDBService();

        const { store, updateStore$ } = useStoreService();
        const updateStore = updateStore$();
        if (!updateStore) return;

        if (store.actionLogListPane.currentActionLogId === "") {
          updateStore((store) => {
            store.actionLogListPane.currentActionLogId = "placeholderActionLogId";
          });
        } else {
          resolve({ collections, store, updateStore });
        }
      }
    );

    const storePromise = new Promise<{ currentPane: string; currentListItemId: string }>((resolve) => {
      let initial = true;

      createRoot(() =>
        createEffect(() => {
          store.actionLogPane.currentListItemId;

          if (initial) {
            initial = false;
            return;
          }

          resolve({ currentPane: store.currentPane, currentListItemId: store.actionLogPane.currentListItemId });
        })
      );
    });

    const storeDocumentPromise = new Promise<{ currentPane: string; currentListItemId: string }>((resolve) => {
      let initial = true;

      collections.stores.findOne("const").$.subscribe((storeDocument) => {
        if (!storeDocument) throw new Error("this should never happen");

        if (initial) {
          initial = false;
          return;
        }

        resolve({ currentPane: storeDocument.currentPane, currentListItemId: storeDocument.actionLogPane.currentListItemId });
      });
    });

    updateStore((store) => {
      store.currentPane = "actionLog";
      store.actionLogPane.currentListItemId = "placeholderListItemId";
    });

    test.expect(await storePromise).toEqual({ currentPane: "actionLog", currentListItemId: "placeholderListItemId" });
    test.expect(await storeDocumentPromise).toEqual({ currentPane: "actionLog", currentListItemId: "placeholderListItemId" });

    unmount();
  });

  test("granular update notification", async (test) => {
    const { unmount, store, updateStore } = await renderAsync(
      (props) => (
        <RxDBServiceProviderForTest tid={test.meta.id}>
          <StoreServiceProvider>{props.children}</StoreServiceProvider>
        </RxDBServiceProviderForTest>
      ),
      (resolve: (value: { store: Store; updateStore: (updater: (store: Store) => void) => void }) => void) => {
        const { store, updateStore$ } = useStoreService();
        const updateStore = updateStore$();
        if (!updateStore) return;

        resolve({ store, updateStore });
      }
    );

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

    updateStore((store) => {
      store.actionLogListPane.currentActionLogId = "placeholderActionLogId";
    });

    test.expect(await currentActionLogIdPromise).toBe("currentActionLogId updated");
    test.expect(await currentListItemIdPromise).toBe("timeout");

    unmount();
  });
}
