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

function emitActionLogListPaneEvent(ctx: Context, event: KeyboardEvent) {
  const { shiftKey } = event;
  const actionLogListPaneEvent = { kind: "pane", pane: "actionLogList" } as const;

  switch (ctx.store.mode) {
    case "normal": {
      const normalModeEvent = { ...actionLogListPaneEvent, mode: "normal" } as const;

      switch (event.code) {
        case "KeyK": {
          if (!shiftKey) {
            ctx.emitEvent({ ...normalModeEvent, type: "moveAbove" });
            event.preventDefault();
          }

          break;
        }

        case "KeyJ": {
          if (!shiftKey) {
            ctx.emitEvent({ ...normalModeEvent, type: "moveBelow" });
            event.preventDefault();
          }

          break;
        }

        case "KeyI": {
          if (!shiftKey) {
            ctx.emitEvent({ ...normalModeEvent, type: "enterInsertMode", focus: "text", initialPosition: "start" });
            event.preventDefault();
          }

          break;
        }

        case "KeyA": {
          if (!shiftKey) {
            ctx.emitEvent({ ...normalModeEvent, type: "enterInsertMode", focus: "text", initialPosition: "end" });
            event.preventDefault();
          }

          break;
        }

        case "KeyO": {
          if (!shiftKey) {
            ctx.emitEvent({ ...normalModeEvent, type: "add" });
            event.preventDefault();
          }

          break;
        }
      }

      break;
    }

    case "insert": {
      const insertModeEvent = { ...actionLogListPaneEvent, mode: "insert" } as const;
      switch (event.code) {
        case "Tab": {
          if (!shiftKey) {
            ctx.emitEvent({ ...insertModeEvent, type: "rotateFocus" });
            event.preventDefault();
          }

          break;
        }

        case "Escape": {
          if (!shiftKey) {
            ctx.emitEvent({ ...insertModeEvent, type: "leaveInsertMode" });
            event.preventDefault();
          }

          break;
        }
      }

      break;
    }
  }
}

function emitActionLogPaneEvent(ctx: Context, event: KeyboardEvent) {
  const { shiftKey } = event;
  const paneKindEvent = { kind: "pane", pane: "actionLog" } as const;

  switch (ctx.store.mode) {
    case "normal": {
      const normalModeEvent = { ...paneKindEvent, mode: "normal" } as const;

      switch (event.code) {
        case "KeyK": {
          if (!shiftKey) {
            ctx.emitEvent({ ...normalModeEvent, type: "moveAbove" });
            event.preventDefault();
          }

          break;
        }

        case "KeyJ": {
          if (!shiftKey) {
            ctx.emitEvent({ ...normalModeEvent, type: "moveBelow" });
            event.preventDefault();
          }

          break;
        }

        case "KeyO": {
          if (shiftKey) {
            ctx.emitEvent({ ...normalModeEvent, type: "addPrev" });
          } else {
            ctx.emitEvent({ ...normalModeEvent, type: "addNext" });
          }
          event.preventDefault();

          break;
        }

        case "Tab": {
          if (shiftKey) {
            ctx.emitEvent({ ...normalModeEvent, type: "dedent" });
          } else {
            ctx.emitEvent({ ...normalModeEvent, type: "indent" });
          }
          event.preventDefault();

          break;
        }

        case "KeyI": {
          ctx.emitEvent({ ...normalModeEvent, type: "enterInsertMode", initialPosition: "start" });
          event.preventDefault();

          break;
        }

        case "KeyA": {
          ctx.emitEvent({ ...normalModeEvent, type: "enterInsertMode", initialPosition: "end" });
          event.preventDefault();

          break;
        }
      }

      break;
    }

    case "insert": {
      const insertModeEvent = { ...paneKindEvent, mode: "insert" } as const;

      switch (event.code) {
        case "Escape": {
          ctx.emitEvent({ ...insertModeEvent, type: "leaveInsertMode" });
          event.preventDefault();

          break;
        }
      }

      break;
    }
  }
}
