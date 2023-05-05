import type { LockService } from "../lock";
import type { Event, ActionLogListPageEvent, ActionLogPageEvent } from "@/services/event";
import type { RxDBService } from "@/services/rxdb";
import type { Collections } from "@/services/rxdb/collections";
import type { Store, StoreService } from "@/services/store";
import type { JSXElement } from "solid-js";

import { Ulid } from "id128";
import { createEffect, untrack } from "solid-js";

import { runWithLock, useLockService } from "../lock";
import { addNextSibling, addPrevSibling, dedent, getNextItem, getPrevItem, indent } from "../rxdb/collections/listItem";
import { useEventService } from "@/services/event";
import { useRxDBService } from "@/services/rxdb";
import { useStoreService } from "@/services/store";

type Context = {
  now: number;
  store: Store;
  updateStore: (updater: (store: Store) => void) => void;

  rxdbService: RxDBService;
  lockService: LockService;
};

export function EventHandlerServiceProvider(props: { children: JSXElement }) {
  const rxdbService = useRxDBService();
  const lockService = useLockService();

  const { store, updateStore$ } = useStoreService();

  const { currentEvent$ } = useEventService();

  createEffect(() => {
    const event = currentEvent$();

    untrack(() => {
      const updateStore = updateStore$();
      if (!updateStore) return;

      handle({ now: Date.now(), store, updateStore, rxdbService, lockService }, event);
    });
  });

  return props.children;
}

async function handle(ctx: Context, event: Event) {
  switch (event.page) {
    case "initial":
      // do nothing
      break;

    case "actionLogList":
      await handleActionLogListPageEvent(ctx, event);
      break;

    case "actionLog":
      await handleActionLogPageEvent(ctx, event);
      break;
  }
}

async function handleActionLogListPageEvent(ctx: Context, event: ActionLogListPageEvent) {}

async function handleActionLogPageEvent(ctx: Context, event: ActionLogPageEvent) {
  if (ctx.store.currentPage !== "actionLog") return;

  const currentListItem = await ctx.rxdbService.collections.listItems.findOne(ctx.store.actionLogPage.currentListItemId).exec();
  if (!currentListItem) return;

  switch (event.type) {
    case "indent": {
      await runWithLock(ctx.lockService, () => indent(ctx.rxdbService.collections, ctx.now, currentListItem));

      break;
    }

    case "dedent": {
      await runWithLock(ctx.lockService, () => dedent(ctx.rxdbService.collections, ctx.now, currentListItem));

      break;
    }

    case "addPrev": {
      await runWithLock(ctx.lockService, async () => {
        const id = Ulid.generate({ time: ctx.now }).toCanonical();

        await addPrevSibling(ctx.rxdbService.collections, ctx.now, currentListItem, { id, text: "" });
        ctx.updateStore((store) => {
          store.actionLogPage.currentListItemId = id;
        });
      });

      break;
    }

    case "addNext": {
      await runWithLock(ctx.lockService, async () => {
        const id = Ulid.generate({ time: ctx.now }).toCanonical();

        await addNextSibling(ctx.rxdbService.collections, ctx.now, currentListItem, { id, text: "" });
        ctx.updateStore((store) => {
          store.actionLogPage.currentListItemId = id;
        });
      });

      break;
    }

    case "moveToPrev": {
      const prevItem = await getPrevItem(ctx.rxdbService.collections, currentListItem);
      if (prevItem) {
        ctx.updateStore((store) => {
          store.actionLogPage.currentListItemId = prevItem.id;
        });
      }

      break;
    }

    case "moveToNext": {
      const nextItem = await getNextItem(ctx.rxdbService.collections, currentListItem);
      if (nextItem) {
        ctx.updateStore((store) => {
          store.actionLogPage.currentListItemId = nextItem.id;
        });
      }

      break;
    }
  }
}
