import type { Event, ActionLogListPageEvent, ActionLogPageEvent } from "@/services/event";
import type { LockService } from "@/services/lock";
import type { RxDBService } from "@/services/rxdb";
import type { Store } from "@/services/store";
import type { JSXElement } from "solid-js";

import { Ulid } from "id128";
import { createEffect, untrack } from "solid-js";

import { useEventService } from "@/services/event";
import { runWithLock, useLockService } from "@/services/lock";
import { useRxDBService } from "@/services/rxdb";
import { addNextSibling, addPrevSibling, dedent, getBelowItem, getAboveItem, indent } from "@/services/rxdb/collections/listItem";
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
      await runWithLock(ctx.lockService, () => indent(ctx.rxdbService, ctx.now, currentListItem));

      break;
    }

    case "dedent": {
      await runWithLock(ctx.lockService, () => dedent(ctx.rxdbService, ctx.now, currentListItem));

      break;
    }

    case "addPrev": {
      await runWithLock(ctx.lockService, async () => {
        const id = Ulid.generate({ time: ctx.now }).toCanonical();

        await addPrevSibling(ctx.rxdbService, ctx.now, currentListItem, { id, text: "" });
        ctx.updateStore((store) => {
          store.actionLogPage.currentListItemId = id;
        });
      });

      break;
    }

    case "addNext": {
      await runWithLock(ctx.lockService, async () => {
        const id = Ulid.generate({ time: ctx.now }).toCanonical();

        await addNextSibling(ctx.rxdbService, ctx.now, currentListItem, { id, text: "" });
        ctx.updateStore((store) => {
          store.actionLogPage.currentListItemId = id;
        });
      });

      break;
    }

    case "moveToPrev": {
      const prevItem = await getAboveItem(ctx.rxdbService, currentListItem);
      if (prevItem) {
        ctx.updateStore((store) => {
          store.actionLogPage.currentListItemId = prevItem.id;
        });
      }

      break;
    }

    case "moveToNext": {
      const nextItem = await getBelowItem(ctx.rxdbService, currentListItem);
      if (nextItem) {
        ctx.updateStore((store) => {
          store.actionLogPage.currentListItemId = nextItem.id;
        });
      }

      break;
    }
  }
}
