import { initialState } from "@/services/store";

declare module "@/services/store" {
  interface State {
    share: {
      isActive: boolean;
      confirmation?: {
        url: string;
        markdownLink: string;
        existingNodeId: string;
        existingNodeText: string;
      };
      isConfirming: boolean;
    };
  }
}

initialState.share = {
  isActive: false,
  isConfirming: false,
};
