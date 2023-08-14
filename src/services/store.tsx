import type { JSXElement } from "solid-js";

import { makePersisted } from "@solid-primitives/storage";
import { createRoot, useContext, createEffect, createContext } from "solid-js";
import { createStore, produce } from "solid-js/store";

import { ServiceNotAvailable } from "@/services/error";
import { renderWithServicesForTest } from "@/services/test";

export type State = {
  mode: "normal" | "insert";

  editor: {
    text: string;
    cursorPosition: number;
  };

  currentPane: "actionLogList" | "actionLog";
  actionLogListPane: {
    currentActionLogId: string;
    focus: "text" | "startAt" | "endAt";
  };
  actionLogPane: {
    currentActionLogId: string;
    currentListItemId: string;
  };
};

const localStorageName = "rejysten.service.store.state";

const initialState: State = {
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
};

export type StoreService = {
  state: State;
  updateState: (updater: (state: State) => void) => void;
};

const context = createContext<StoreService>();

export function StoreServiceProvider(props: { localStorageNamePostfix?: string; children: JSXElement }) {
  const [state, setState] = makePersisted(createStore<State>(structuredClone(initialState)), {
    storage: window.localStorage,
    name: localStorageName + (props.localStorageNamePostfix ?? ""),
  });

  function updateState(updater: (state: State) => void) {
    setState(produce(updater));
  }

  return <context.Provider value={{ state, updateState }}>{props.children}</context.Provider>;
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
      store: { state },
    } = await renderWithServicesForTest(test.meta.id, (props) => props.children);

    test.expect(state).toEqual(initialState);

    unmount();
  });

  test("update store from initial store", async (test) => {
    const {
      unmount,
      store: { state, updateState },
    } = await renderWithServicesForTest(test.meta.id, (props) => props.children);

    const storePromise = new Promise<string>((resolve) => {
      let initial = true;

      createRoot(() =>
        createEffect(() => {
          state.actionLogListPane.currentActionLogId;

          if (initial) {
            initial = false;
            return;
          }

          resolve(state.actionLogListPane.currentActionLogId);
        })
      );
    });

    updateState((state) => {
      state.actionLogListPane.currentActionLogId = "placeholderActionLogId";
    });

    test.expect(await storePromise).toBe("placeholderActionLogId");

    unmount();
  });

  test("update store from non-initial store", async (test) => {
    const {
      unmount,
      store: { state, updateState },
    } = await renderWithServicesForTest(
      test.meta.id,
      (props) => props.children,
      ({ store: { updateState } }) => {
        updateState((state) => {
          state.actionLogListPane.currentActionLogId = "placeholderActionLogId";
        });

        return Promise.resolve();
      }
    );

    const storePromise = new Promise<{
      currentPane: string;
      currentListItemId: string;
    }>((resolve) => {
      let initial = true;

      createRoot(() =>
        createEffect(() => {
          state.actionLogPane.currentListItemId;

          if (initial) {
            initial = false;
            return;
          }

          resolve({
            currentPane: state.currentPane,
            currentListItemId: state.actionLogPane.currentListItemId,
          });
        })
      );
    });

    updateState((state) => {
      state.currentPane = "actionLog";
      state.actionLogPane.currentListItemId = "placeholderListItemId";
    });

    test.expect(await storePromise).toEqual({
      currentPane: "actionLog",
      currentListItemId: "placeholderListItemId",
    });

    unmount();
  });

  test("granular update notification", async (test) => {
    const {
      unmount,
      store: { state, updateState },
    } = await renderWithServicesForTest(test.meta.id, (props) => props.children);

    const currentActionLogIdPromise = Promise.race([
      new Promise<string>((resolve) => {
        setTimeout(() => resolve("timeout"), 100);
      }),
      new Promise<string>((resolve) => {
        let initial = true;

        createRoot(() =>
          createEffect(() => {
            state.actionLogListPane.currentActionLogId;

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
            state.actionLogPane.currentListItemId;

            if (initial) {
              initial = false;
              return;
            }

            resolve("currentListItemId updated");
          })
        );
      }),
    ]);

    updateState((store) => {
      store.actionLogListPane.currentActionLogId = "placeholderActionLogId";
    });

    test.expect(await currentActionLogIdPromise).toBe("currentActionLogId updated");
    test.expect(await currentListItemIdPromise).toBe("timeout");

    unmount();
  });
}
