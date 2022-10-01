import type { TypedUseSelectorHook } from "react-redux";
import type { ReactNode } from "react";

import { configureStore } from "@reduxjs/toolkit";
import { combineReducers } from "redux";
import {
  useDispatch as useReduxDispatch,
  useSelector as useReduxSelector,
} from "react-redux";
import { Provider as ReactReduxProvider } from "react-redux";
import {
  persistStore,
  persistReducer,
  FLUSH,
  REHYDRATE,
  PAUSE,
  PERSIST,
  PURGE,
  REGISTER,
} from "redux-persist";
import { PersistGate } from "redux-persist/integration/react";
import storage from "redux-persist/lib/storage";

import { app } from "@/slices/app";
import { rxdbSync } from "@/slices/rxdbSync";

const persistConfig = {
  key: "redux",
  storage,
  whitelist: ["rxdbSync"],
};

const persistedReducer = persistReducer(
  persistConfig,
  combineReducers({
    app: app.reducer,
    rxdbSync: rxdbSync.reducer,
  })
);

export const store = configureStore({
  reducer: persistedReducer,
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware({
      serializableCheck: {
        ignoredActions: [FLUSH, REHYDRATE, PAUSE, PERSIST, PURGE, REGISTER],
      },
    }),
});

const persistor = persistStore(store);

export function Provider(props: { children: ReactNode }) {
  return (
    <ReactReduxProvider store={store}>
      <PersistGate loading={null} persistor={persistor}>
        {props.children}
      </PersistGate>
    </ReactReduxProvider>
  );
}

type Dispatch = typeof store.dispatch;
type State = ReturnType<typeof store.getState>;

export const useDispatch: () => Dispatch = useReduxDispatch;
export const useSelector: TypedUseSelectorHook<State> = useReduxSelector;
