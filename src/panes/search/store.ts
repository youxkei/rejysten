import { initialState } from "@/services/store";

declare module "@/services/store" {
  interface State {
    panesSearch: {
      query: string;
      selectedResultIndex: number;
    };
  }
}

initialState.panesSearch = {
  query: "",
  selectedResultIndex: 0,
};
