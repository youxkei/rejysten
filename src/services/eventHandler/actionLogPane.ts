import type { ActionLogPaneEvent } from "@/services/event";
import type { Context } from "@/services/eventHandler/context";

import { Ulid } from "id128";

import { ErrorWithFields, NeverErrorWithFields } from "@/error";
import { addNextSibling, addPrevSibling, dedent, getBelowItem, getAboveItem, indent } from "@/services/rxdb/collections/listItem";

export async function handleActionLogPaneEvent(ctx: Context, event: ActionLogPaneEvent) {
  if (ctx.store.store.currentPane !== "actionLog") {
    throw new ErrorWithFields("ActionLogPaneEvent must be emitted when currentPane is actionLog", { event, store: ctx.store.store });
  }

  const currentListItem = await ctx.rxdb.collections.listItems.findOne(ctx.store.store.actionLogPane.currentListItemId).exec();
  if (!currentListItem) return;

  switch (event.mode) {
    case "normal": {
      if (ctx.store.store.mode !== "normal") {
        return;
      }

      switch (event.type) {
        case "indent": {
          await indent(ctx.rxdb, ctx.now, currentListItem);

          break;
        }

        case "dedent": {
          await dedent(ctx.rxdb, ctx.now, currentListItem);

          break;
        }

        case "addPrev": {
          const id = Ulid.generate({ time: ctx.now }).toCanonical();

          await addPrevSibling(ctx.rxdb, ctx.now, currentListItem, { id, text: "" });
          await ctx.store.updateStore((store) => {
            store.actionLogPane.currentListItemId = id;
          });

          break;
        }

        case "addNext": {
          const id = Ulid.generate({ time: ctx.now }).toCanonical();

          await addNextSibling(ctx.rxdb, ctx.now, currentListItem, { id, text: "" });
          await ctx.store.updateStore((store) => {
            store.actionLogPane.currentListItemId = id;
          });

          break;
        }

        case "moveAbove": {
          const prevItem = await getAboveItem(ctx.rxdb, currentListItem);
          if (prevItem) {
            await ctx.store.updateStore((store) => {
              store.actionLogPane.currentListItemId = prevItem.id;
            });
          }

          break;
        }

        case "moveBelow": {
          const nextItem = await getBelowItem(ctx.rxdb, currentListItem);
          if (nextItem) {
            await ctx.store.updateStore((store) => {
              store.actionLogPane.currentListItemId = nextItem.id;
            });
          }

          break;
        }

        case "enterInsertMode": {
          await ctx.store.updateStore((store) => {
            store.mode = "insert";
            store.editor.initialPosition = event.initialPosition;
          });
          break;
        }

        case "moveToActionLogListPane": {
          await ctx.store.updateStore((store) => {
            store.currentPane = "actionLogList";
            store.actionLogPane.currentListItemId = "";
            store.actionLogPane.currentActionLogId = "";
          });

          break;
        }

        default: {
          throw new NeverErrorWithFields("unknown event.type", { event }, event);
        }
      }

      break;
    }

    case "insert": {
      if (ctx.store.store.mode !== "insert") {
        return;
      }

      switch (event.type) {
        case "changeEditorText": {
          await currentListItem.patch({ text: event.newText, updatedAt: ctx.now });

          break;
        }

        case "leaveInsertMode": {
          await ctx.store.updateStore((store) => {
            store.mode = "normal";
          });

          break;
        }

        default: {
          throw new NeverErrorWithFields("unknown event.type", { event }, event);
        }
      }

      break;
    }

    default: {
      throw new NeverErrorWithFields("unknown event.mode", { event }, event);
    }
  }
}
