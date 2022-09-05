import type { TypedUseSelectorHook } from "react-redux";

import { configureStore } from "@reduxjs/toolkit";
import {
  useDispatch as useReduxDispatch,
  useSelector as useReduxSelector,
} from "react-redux";

import { app } from "./slice/app";

export const store = configureStore({
  reducer: {
    app: app.reducer,
  },
});

type Dispatch = typeof store.dispatch;
type State = ReturnType<typeof store.getState>;

export const useDispatch: () => Dispatch = useReduxDispatch;
export const useSelector: TypedUseSelectorHook<State> = useReduxSelector;
