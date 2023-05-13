import type { Event, ActionLogListPaneEvent, ActionLogPaneEvent } from "@/services/event";
import type { LockService } from "@/services/lock";
import type { RxDBService } from "@/services/rxdb";
import type { StoreService } from "@/services/store";
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

  rxdbService: RxDBService;
  storeService: StoreService;
  lockService: LockService;
};

export function EventHandlerServiceProvider(props: { children: JSXElement }) {
  const rxdbService = useRxDBService();
  const storeService = useStoreService();
  const lockService = useLockService();

  const { currentEvent$ } = useEventService();

  createEffect(() => {
    const event = currentEvent$();

    untrack(() =>
      runWithLock(lockService, async () => {
        await handle({ now: Date.now(), rxdbService, storeService, lockService }, event);
      })
    );
  });

  return props.children;
}

async function handle(ctx: Context, event: Event) {
  switch (event.pane) {
    case "initial":
      // do nothing
      break;

    case "actionLogList":
      await handleActionLogListPaneEvent(ctx, event);
      break;

    case "actionLog":
      await handleActionLogPaneEvent(ctx, event);
      break;
  }
}

async function handleActionLogListPaneEvent(ctx: Context, event: ActionLogListPaneEvent) {}

async function handleActionLogPaneEvent(ctx: Context, event: ActionLogPaneEvent) {
  if (ctx.storeService.store.currentPane !== "actionLog") return;

  const currentListItem = await ctx.rxdbService.collections.listItems.findOne(ctx.storeService.store.actionLogPane.currentListItemId).exec();
  if (!currentListItem) return;

  switch (event.type) {
    case "indent": {
      await indent(ctx.rxdbService, ctx.now, currentListItem);

      break;
    }

    case "dedent": {
      await dedent(ctx.rxdbService, ctx.now, currentListItem);

      break;
    }

    case "addPrev": {
      const id = Ulid.generate({ time: ctx.now }).toCanonical();

      await addPrevSibling(ctx.rxdbService, ctx.now, currentListItem, { id, text: "" });
      ctx.storeService.updateStore((store) => {
        store.actionLogPane.currentListItemId = id;
      });

      break;
    }

    case "addNext": {
      const id = Ulid.generate({ time: ctx.now }).toCanonical();

      await addNextSibling(ctx.rxdbService, ctx.now, currentListItem, { id, text: "" });
      ctx.storeService.updateStore((store) => {
        store.actionLogPane.currentListItemId = id;
      });

      break;
    }

    case "moveAbove": {
      const prevItem = await getAboveItem(ctx.rxdbService, currentListItem);
      if (prevItem) {
        ctx.storeService.updateStore((store) => {
          store.actionLogPane.currentListItemId = prevItem.id;
        });
      }

      break;
    }

    case "moveBelow": {
      const nextItem = await getBelowItem(ctx.rxdbService, currentListItem);
      if (nextItem) {
        ctx.storeService.updateStore((store) => {
          store.actionLogPane.currentListItemId = nextItem.id;
        });
      }

      break;
    }
  }
}
