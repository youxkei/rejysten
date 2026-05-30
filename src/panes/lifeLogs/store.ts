import { initialState } from "@/services/store";

declare module "@/services/store" {
  interface State {
    panesLifeLogs: {
      selectedLifeLogId: string;
      selectedLifeLogNodeId: string;
      isJumpDateDialogOpen: boolean;
      jumpDateText: string;
    };
  }
}

initialState.panesLifeLogs = {
  selectedLifeLogId: "",
  selectedLifeLogNodeId: "",
  isJumpDateDialogOpen: false,
  jumpDateText: "",
};
