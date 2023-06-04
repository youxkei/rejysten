import type { Event } from "@/services/event";
import type { RxDBService } from "@/services/rxdb";
import type { Store } from "@/services/store";

export type Context = {
  store: Store;
  emitEvent: (event: Event) => void;

  rxdb: RxDBService;
};
