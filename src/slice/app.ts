import type { PayloadAction } from "@reduxjs/toolkit";

import { createSlice } from "@reduxjs/toolkit";

export const app = createSlice({
  name: "app",
  initialState: {
    text: "Hello, world!",
  },
  reducers: {
    updateText: (state, { payload }: PayloadAction<{ text: string }>) => {
      state.text = payload.text;
    },
  },
});
