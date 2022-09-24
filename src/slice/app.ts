import type { PayloadAction } from "@reduxjs/toolkit";

import { createSlice } from "@reduxjs/toolkit";

export const app = createSlice({
  name: "app",
  initialState: {
    text: "Hello, world!",
    id: "",
  },
  reducers: {
    updateText: (state, { payload }: PayloadAction<{ text: string }>) => {
      state.text = payload.text;
    },
    updateId: (state, { payload }: PayloadAction<{ id: string }>) => {
      state.id = payload.id;
    },
  },
});
