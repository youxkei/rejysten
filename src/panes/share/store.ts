import { initialState } from "@/services/store";

declare module "@/services/store" {
  interface State {
    panesShare: {
      isActive: boolean;
    };
  }
}

initialState.panesShare = {
  isActive: false,
};
