import type { PayloadAction } from "@reduxjs/toolkit";

import { createSlice } from "@reduxjs/toolkit";

export const rxdbSync = createSlice({
  name: "rxdbSync",
  initialState: {
    domain: "",
    user: "",
    pass: "",
    syncing: false,
    errors: [] as string[],
  },
  reducers: {
    updateDomain: (state, { payload }: PayloadAction<{ domain: string }>) => {
      state.domain = payload.domain;
      state.syncing = false;
      state.errors = [];
    },
    updateUser: (state, { payload }: PayloadAction<{ user: string }>) => {
      state.user = payload.user;
      state.syncing = false;
      state.errors = [];
    },
    updatePass: (state, { payload }: PayloadAction<{ pass: string }>) => {
      state.pass = payload.pass;
      state.syncing = false;
      state.errors = [];
    },
    startSync: (state) => {
      state.syncing = true;
      state.errors = [];
    },
    syncError: (state, { payload }: PayloadAction<{ error: string }>) => {
      state.errors.push(payload.error);
    },
  },
});
