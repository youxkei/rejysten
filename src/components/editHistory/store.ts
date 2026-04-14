import { initialState } from "@/services/store";

declare module "@/services/store" {
  interface State {
    editHistory: {
      isPanelOpen: boolean;
    };
  }
}

initialState.editHistory = {
  isPanelOpen: false,
};
