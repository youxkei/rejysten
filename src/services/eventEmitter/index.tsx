import type { Event } from "@/services/event";
import type { RxDBService } from "@/services/rxdb";
import type { Store } from "@/services/store";
import type { JSXElement } from "solid-js";

import { useKeyDownEvent } from "@solid-primitives/keyboard";
import { createEffect, untrack } from "solid-js";

import { NeverErrorWithFields } from "@/error";
import { useEventService } from "@/services/event";
import { useRxDBService } from "@/services/rxdb";
import { getAboveLog } from "@/services/rxdb/collections/actionLog";
import { useStoreService } from "@/services/store";

type Context = {
  store: Store;
  emitEvent: (event: Event) => void;
  rxdb: RxDBService;
};

export function EventEmitterServiceProvider(props: { children: JSXElement }) {
  const { store } = useStoreService();
  const { emitEvent } = useEventService();
  const rxdb = useRxDBService();

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
      const ctx = { store, emitEvent, rxdb };

      switch (store.currentPane) {
        case "actionLogList": {
          void emitActionLogListPaneEvent(ctx, event);
          break;
        }

        case "actionLog": {
          emitActionLogPaneEvent(ctx, event);
          break;
        }

        default: {
          throw new NeverErrorWithFields("unknown store.currentPane", { store }, store.currentPane);
        }
      }
    });
  });

  return props.children;
}

async function emitActionLogListPaneEvent(ctx: Context, event: KeyboardEvent) {
  const { shiftKey, isComposing } = event;
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

        case "Backspace": {
          if (shiftKey || isComposing || ctx.store.actionLogListPane.focus !== "text") break;

          const currentActionLog = await ctx.rxdb.collections.actionLogs.findOne(ctx.store.actionLogListPane.currentActionLogId).exec();
          if (!currentActionLog || currentActionLog.text !== "") break;

          const items = await ctx.rxdb.collections.listItems.find({ selector: { parentId: currentActionLog.id } }).exec();
          if (items.length > 0) break;

          const aboveActionLog = await getAboveLog(ctx.rxdb, currentActionLog);
          if (!aboveActionLog) break;

          ctx.emitEvent({ ...insertModeEvent, type: "delete" });
          event.preventDefault();

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
