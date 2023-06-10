import type { Event } from "@/services/event";
import type { Context } from "@/services/eventHandler/context";
import type { JSXElement } from "solid-js";

import { untrack } from "solid-js";

import { NeverErrorWithFields } from "@/error";
import { useEventService } from "@/services/event";
import { handleActionLogListPaneEvent } from "@/services/eventHandler/actionLogListPane";
import { handleActionLogPaneEvent } from "@/services/eventHandler/actionLogPane";
import { runWithLock, useLockService } from "@/services/lock";
import { useRxDBService } from "@/services/rxdb";
import { useStoreService } from "@/services/store";

export function EventHandlerServiceProvider(props: { children: JSXElement }) {
  const rxdb = useRxDBService();
  const store = useStoreService();
  const lock = useLockService();
  const event = useEventService();

  event.registerEventHandler(async (currentEvent: Event) => {
    await untrack(() => runWithLock(lock, () => handlePaneEvent({ now: Date.now(), rxdb, store, event }, currentEvent)));
  });

  return props.children;
}

async function handlePaneEvent(ctx: Context, event: Event) {
  console.debug("event handler start", event);

  switch (event.pane) {
    case "actionLogList": {
      await handleActionLogListPaneEvent(ctx, event);
      break;
    }

    case "actionLog": {
      await handleActionLogPaneEvent(ctx, event);
      break;
    }

    default: {
      throw new NeverErrorWithFields("unknown event.pane", { event }, event);
    }
  }

  console.debug("event handler end", event);
}
