import { initialState } from "@/services/store";

declare module "@/services/store" {
  interface State {
    panesSearch: {
      isActive: boolean;
      query: string;
      selectedResultIndex: number;
    };
  }
}

initialState.panesSearch = {
  isActive: false,
  query: "",
  selectedResultIndex: 0,
};
