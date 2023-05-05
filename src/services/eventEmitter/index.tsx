import type { Event } from "@/services/event";
import type { Store } from "@/services/store";
import type { JSXElement } from "solid-js";

import { useKeyDownEvent } from "@solid-primitives/keyboard";
import { createEffect, untrack } from "solid-js";

import { useEventService } from "@/services/event";
import { useStoreService } from "@/services/store";

type Context = {
  store: Store;
  emitEvent: (event: Event) => void;
};

export function EventEmitterServiceProvider(props: { children: JSXElement }) {
  const { store } = useStoreService();
  const { emitEvent } = useEventService();

  const keyDownEvent$ = useKeyDownEvent();

  createEffect(() => {
    const event = keyDownEvent$();
    if (!event) return;

    untrack(() => {
      const ctx = { store, emitEvent };

      switch (store.currentPage) {
        case "actionLogList": {
          emitActionLogListPageEvent(ctx, event);
          break;
        }

        case "actionLog": {
          emitActionLogPageEvent(ctx, event);
          break;
        }
      }
    });
  });

  return props.children;
}

function emitActionLogListPageEvent(ctx: Context, event: KeyboardEvent) {}

function emitActionLogPageEvent(ctx: Context, event: KeyboardEvent) {
  const { shiftKey } = event;

  switch (event.code) {
    case "KeyK": {
      if (!shiftKey) {
        ctx.emitEvent({ page: "actionLog", type: "moveAbove" });
        event.preventDefault();
      }

      break;
    }

    case "KeyJ": {
      if (!shiftKey) {
        ctx.emitEvent({ page: "actionLog", type: "moveBelow" });
        event.preventDefault();
      }

      break;
    }

    case "KeyO": {
      if (shiftKey) {
        ctx.emitEvent({ page: "actionLog", type: "addPrev" });
      } else {
        console.log("event:", { page: "actionLog", type: "addNext" });
        ctx.emitEvent({ page: "actionLog", type: "addNext" });
      }
      event.preventDefault();

      break;
    }

    case "Tab": {
      if (shiftKey) {
        ctx.emitEvent({ page: "actionLog", type: "dedent" });
      } else {
        ctx.emitEvent({ page: "actionLog", type: "indent" });
      }
      event.preventDefault();

      break;
    }
  }
}
