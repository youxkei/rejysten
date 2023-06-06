import type { Context } from "@/services/eventEmitter/context";

import { getAboveItem } from "@/services/rxdb/collections/listItem";

export async function emitActionLogPaneEvent(ctx: Context, event: KeyboardEvent) {
  const { shiftKey, isComposing } = event;
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

        case "KeyH": {
          if (!shiftKey) {
            ctx.emitEvent({ ...normalModeEvent, type: "moveToActionLogListPane" });
            event.preventDefault();
          }

          break;
        }
      }

      break;
    }

    case "insert": {
      const insertModeEvent = { ...paneKindEvent, mode: "insert" } as const;

      switch (event.code) {
        case "Tab": {
          if (shiftKey) {
            ctx.emitEvent({ ...insertModeEvent, type: "dedent" });
          } else {
            ctx.emitEvent({ ...insertModeEvent, type: "indent" });
          }
          event.preventDefault();

          break;
        }

        case "Escape": {
          ctx.emitEvent({ ...insertModeEvent, type: "leaveInsertMode" });
          event.preventDefault();

          break;
        }

        case "Backspace": {
          if (shiftKey || isComposing) break;

          const currentListItem = await ctx.rxdb.collections.listItems.findOne(ctx.store.actionLogPane.currentListItemId).exec();
          if (!currentListItem || currentListItem.text !== "") break;

          const childrenItems = await ctx.rxdb.collections.listItems.find({ selector: { parentId: currentListItem.id } }).exec();
          if (childrenItems.length > 0) break;

          const aboveListItem = await getAboveItem(ctx.rxdb, currentListItem);
          if (!aboveListItem) break;

          ctx.emitEvent({ ...insertModeEvent, type: "delete" });
          event.preventDefault();

          break;
        }
      }

      break;
    }
  }
}
