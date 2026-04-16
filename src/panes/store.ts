import { initialState } from "@/services/store";

declare module "@/services/store" {
  interface State {
    activePane: "lifeLogs" | "search";
  }
}

initialState.activePane = "lifeLogs";
