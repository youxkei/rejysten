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

    if (event.code === "AltLeft" || event.code === "AltRight") {
      // disable alt key to avoid browser menu
      event.preventDefault();
      return;
    }

    untrack(() => {
      const ctx = { store, emitEvent };

      switch (store.currentPane) {
        case "actionLogList": {
          emitActionLogListPaneEvent(ctx, event);
          break;
        }

        case "actionLog": {
          emitActionLogPaneEvent(ctx, event);
          break;
        }
      }
    });
  });

  return props.children;
}

function emitActionLogListPaneEvent(ctx: Context, event: KeyboardEvent) {}

function emitActionLogPaneEvent(ctx: Context, event: KeyboardEvent) {
  const { shiftKey } = event;

  switch (ctx.store.mode) {
    case "normal": {
      switch (event.code) {
        case "KeyK": {
          if (!shiftKey) {
            ctx.emitEvent({ type: "pane", event: { pane: "actionLog", type: "moveAbove" } });
            event.preventDefault();
          }

          break;
        }

        case "KeyJ": {
          if (!shiftKey) {
            ctx.emitEvent({ type: "pane", event: { pane: "actionLog", type: "moveBelow" } });
            event.preventDefault();
          }

          break;
        }

        case "KeyO": {
          if (shiftKey) {
            ctx.emitEvent({ type: "pane", event: { pane: "actionLog", type: "addPrev" } });
          } else {
            ctx.emitEvent({ type: "pane", event: { pane: "actionLog", type: "addNext" } });
          }
          event.preventDefault();

          break;
        }

        case "Tab": {
          if (shiftKey) {
            ctx.emitEvent({ type: "pane", event: { pane: "actionLog", type: "dedent" } });
          } else {
            ctx.emitEvent({ type: "pane", event: { pane: "actionLog", type: "indent" } });
          }
          event.preventDefault();

          break;
        }

        case "KeyI": {
          ctx.emitEvent({ type: "pane", event: { pane: "actionLog", type: "enterInsertMode", initialPosition: "start" } });
          event.preventDefault();

          break;
        }

        case "KeyA": {
          ctx.emitEvent({ type: "pane", event: { pane: "actionLog", type: "enterInsertMode", initialPosition: "end" } });
          event.preventDefault();

          break;
        }
      }

      break;
    }

    case "insert": {
      switch (event.code) {
        case "Escape": {
          ctx.emitEvent({ type: "pane", event: { pane: "actionLog", type: "leaveInsertMode" } });
          event.preventDefault();

          break;
        }
      }

      break;
    }
  }
}
