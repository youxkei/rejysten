import type { EventService } from "@/services/event";
import type { RxDBService } from "@/services/rxdb";
import type { StoreService } from "@/services/store";

export type Context = {
  now: number;

  rxdb: RxDBService;
  store: StoreService;
  event: EventService;
};
