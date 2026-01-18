import { initialState } from "@/services/store";

declare module "@/services/store" {
  interface State {
    panesLifeLogs: {
      selectedLifeLogId: string;
      selectedLifeLogNodeId: string;
    };
  }
}

initialState.panesLifeLogs = {
  selectedLifeLogId: "",
  selectedLifeLogNodeId: "",
};
