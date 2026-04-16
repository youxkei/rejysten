import { initialState } from "@/services/store";

declare module "@/services/store" {
  interface State {
    share: {
      isActive: boolean;
    };
  }
}

initialState.share = {
  isActive: false,
};
