import type { PayloadAction } from "@reduxjs/toolkit";

import { createSlice } from "@reduxjs/toolkit";

export const rxdbSync = createSlice({
  name: "rxdbSync",
  initialState: {
    domain: "",
    user: "",
    pass: "",
    syncing: false,
  },
  reducers: {
    updateDomain: (state, { payload }: PayloadAction<{ domain: string }>) => {
      state.domain = payload.domain;
      state.syncing = false;
    },
    updateUser: (state, { payload }: PayloadAction<{ user: string }>) => {
      state.user = payload.user;
      state.syncing = false;
    },
    updatePass: (state, { payload }: PayloadAction<{ pass: string }>) => {
      state.pass = payload.pass;
      state.syncing = false;
    },
    startSync: (state) => {
      state.syncing = true;
    },
  },
});
