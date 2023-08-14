import type { Event } from "@/services/event";
import type { State } from "@/services/store";

export type Context = {
  state: State;
  emitEvent: (event: Event) => void;
};
