import type { Context } from "@/services/eventEmitter/context";

import { getAboveItem } from "@/services/rxdb/collections/listItem";

export async function emitActionLogPaneEvent(ctx: Context, event: KeyboardEvent) {
  switch (ctx.store.mode) {
    case "normal": {
      emitNormalModeEvent(ctx, event);

      break;
    }

    case "insert": {
      await emitInsertModeEvent(ctx, event);

      break;
    }
  }
}

function emitNormalModeEvent(ctx: Context, event: KeyboardEvent) {
  const { shiftKey } = event;
  const baseEvent = { kind: "pane", pane: "actionLog", mode: "normal" } as const;

  switch (event.code) {
    case "KeyK": {
      if (shiftKey) break;

      ctx.emitEvent({ ...baseEvent, type: "moveAbove" });
      event.preventDefault();

      break;
    }

    case "KeyJ": {
      if (shiftKey) break;

      ctx.emitEvent({ ...baseEvent, type: "moveBelow" });
      event.preventDefault();

      break;
    }

    case "KeyO": {
      if (shiftKey) {
        ctx.emitEvent({ ...baseEvent, type: "addPrev" });
      } else {
        ctx.emitEvent({ ...baseEvent, type: "addNext" });
      }
      event.preventDefault();

      break;
    }

    case "Tab": {
      if (shiftKey) {
        ctx.emitEvent({ ...baseEvent, type: "dedent" });
      } else {
        ctx.emitEvent({ ...baseEvent, type: "indent" });
      }
      event.preventDefault();

      break;
    }

    case "KeyI": {
      if (shiftKey) break;

      ctx.emitEvent({ ...baseEvent, type: "enterInsertMode", initialPosition: "start" });
      event.preventDefault();

      break;
    }

    case "KeyA": {
      if (shiftKey) break;

      ctx.emitEvent({ ...baseEvent, type: "enterInsertMode", initialPosition: "end" });
      event.preventDefault();

      break;
    }

    case "KeyH": {
      if (shiftKey) break;

      ctx.emitEvent({ ...baseEvent, type: "moveToActionLogListPane" });
      event.preventDefault();

      break;
    }
  }
}

async function emitInsertModeEvent(ctx: Context, event: KeyboardEvent) {
  const { shiftKey, isComposing } = event;
  const baseEvent = { kind: "pane", pane: "actionLog", mode: "insert" } as const;

  switch (event.code) {
    case "Tab": {
      if (shiftKey) {
        ctx.emitEvent({ ...baseEvent, type: "dedent" });
      } else {
        ctx.emitEvent({ ...baseEvent, type: "indent" });
      }
      event.preventDefault();

      break;
    }

    case "Escape": {
      ctx.emitEvent({ ...baseEvent, type: "leaveInsertMode" });
      event.preventDefault();

      break;
    }

    case "Backspace": {
      if (shiftKey || isComposing) break;

      const currentListItem = await ctx.rxdb.collections.listItems.findOne(ctx.store.actionLogPane.currentListItemId).exec();
      if (!currentListItem || currentListItem.text !== "") break;

      const childrenItems = await ctx.rxdb.collections.listItems.find({ selector: { parentId: currentListItem.id } }).exec();
      if (childrenItems.length > 0) break;

      if (currentListItem.prevId === "" && currentListItem.nextId === "" && currentListItem.parentId === ctx.store.actionLogPane.currentActionLogId) {
        ctx.emitEvent({ ...baseEvent, type: "deleteAndMoveToActionLogListPane" });
        event.preventDefault();

        break;
      }

      const aboveListItem = await getAboveItem(ctx.rxdb, currentListItem);
      if (!aboveListItem) return;

      ctx.emitEvent({ ...baseEvent, type: "delete" });
      event.preventDefault();

      break;
    }
  }
}
