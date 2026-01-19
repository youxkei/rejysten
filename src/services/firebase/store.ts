import { initialState } from "@/services/store";

declare module "@/services/store" {
  interface State {
    firebase: {
      configYAML: string;
    };
  }
}

initialState.firebase = {
  configYAML: "",
};
