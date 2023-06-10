import type { ActionLogListPaneEvent } from "@/services/event";
import type { Context } from "@/services/eventHandler/context";

import { Ulid } from "id128";

import { ErrorWithFields, NeverErrorWithFields } from "@/error";
import { getAboveLog, getBelowLog } from "@/services/rxdb/collections/actionLog";
import { epochMsToTimeText, timeTextToEpochMs } from "@/temporal";

export async function handleActionLogListPaneEvent(ctx: Context, event: ActionLogListPaneEvent) {
  if (ctx.store.store.currentPane !== "actionLogList") {
    throw new ErrorWithFields("ActionLogListPaneEvent must be emitted when currentPane is actionLogList", { event, store: ctx.store.store });
  }

  const currentActionLog = await ctx.rxdb.collections.actionLogs.findOne(ctx.store.store.actionLogListPane.currentActionLogId).exec();
  if (!currentActionLog) return;

  switch (event.mode) {
    case "normal": {
      if (ctx.store.store.mode !== "normal") {
        return;
      }

      switch (event.type) {
        case "moveAbove": {
          const aboveActionLog = await getAboveLog(ctx.rxdb, currentActionLog);
          if (aboveActionLog) {
            await ctx.store.updateStore((store) => {
              store.actionLogListPane.currentActionLogId = aboveActionLog.id;
            });
          }

          break;
        }

        case "moveBelow": {
          const belowActionLog = await getBelowLog(ctx.rxdb, currentActionLog);
          if (belowActionLog) {
            await ctx.store.updateStore((store) => {
              store.actionLogListPane.currentActionLogId = belowActionLog.id;
            });
          }

          break;
        }

        case "add": {
          const id = Ulid.generate({ time: ctx.now }).toCanonical();

          await ctx.rxdb.collections.actionLogs.insert({
            id,
            text: "",
            startAt: currentActionLog.endAt || (ctx.now / 1000) * 1000,
            endAt: 0,
            updatedAt: ctx.now,
          });

          await ctx.store.updateStore((store) => {
            store.mode = "insert";
            store.editor.initialPosition = "end";
            store.actionLogListPane.currentActionLogId = id;
            store.actionLogListPane.focus = "text";
          });

          break;
        }

        case "focus": {
          const nextActionLog = await ctx.rxdb.collections.actionLogs.findOne(event.actionLogId).exec();
          if (nextActionLog) {
            await ctx.store.updateStore((store) => {
              store.actionLogListPane.currentActionLogId = nextActionLog.id;
            });
          }

          break;
        }

        case "enterInsertMode": {
          await ctx.store.updateStore((store) => {
            store.mode = "insert";
            store.actionLogListPane.focus = event.focus;
            store.editor.initialPosition = event.initialPosition;

            switch (event.focus) {
              case "startAt": {
                store.editor.text = epochMsToTimeText(currentActionLog.startAt, true);
                break;
              }

              case "endAt": {
                store.editor.text = epochMsToTimeText(currentActionLog.endAt, true);
                break;
              }
            }
          });

          break;
        }

        case "start": {
          if (currentActionLog.startAt !== 0) break;

          const aboveActionLog = await getAboveLog(ctx.rxdb, currentActionLog);

          if (aboveActionLog && aboveActionLog.endAt > 0) {
            await currentActionLog.patch({ startAt: aboveActionLog.endAt, updatedAt: ctx.now });
          } else {
            await currentActionLog.patch({ startAt: (ctx.now / 1000) * 1000, updatedAt: ctx.now });
          }

          break;
        }

        case "finish": {
          if (currentActionLog.endAt !== 0) break;

          await currentActionLog.patch({ endAt: (ctx.now / 1000) * 1000, updatedAt: ctx.now });

          break;
        }

        case "moveToActionLogPane": {
          await ctx.store.updateStore((store) => {
            store.currentPane = "actionLog";
            store.actionLogPane.currentListItemId = "";
            store.actionLogPane.currentActionLogId = currentActionLog.id;
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
          switch (ctx.store.store.actionLogListPane.focus) {
            case "text": {
              await currentActionLog.patch({ text: event.newText, updatedAt: ctx.now });

              break;
            }

            case "startAt":
            case "endAt": {
              await ctx.store.updateStore((store) => {
                store.editor.text = event.newText;
              });

              break;
            }
          }

          break;
        }

        case "rotateFocus": {
          switch (ctx.store.store.actionLogListPane.focus) {
            case "startAt": {
              const startAt = timeTextToEpochMs(ctx.store.store.editor.text);
              if (isFinite(startAt)) {
                await currentActionLog.patch({ startAt, updatedAt: ctx.now });
              }

              break;
            }

            case "endAt": {
              const endAt = timeTextToEpochMs(ctx.store.store.editor.text);
              if (isFinite(endAt)) {
                await currentActionLog.patch({ endAt, updatedAt: ctx.now });
              }

              break;
            }
          }

          await ctx.store.updateStore((store) => {
            switch (store.actionLogListPane.focus) {
              case "text": {
                store.actionLogListPane.focus = "startAt";
                store.editor.text = epochMsToTimeText(currentActionLog.startAt, true);
                break;
              }

              case "startAt": {
                store.actionLogListPane.focus = "endAt";
                store.editor.text = epochMsToTimeText(currentActionLog.endAt, true);
                break;
              }

              case "endAt": {
                store.actionLogListPane.focus = "text";
                store.editor.text = "";
                break;
              }
            }
          });

          break;
        }

        case "leaveInsertMode": {
          switch (ctx.store.store.actionLogListPane.focus) {
            case "startAt": {
              const startAt = timeTextToEpochMs(ctx.store.store.editor.text);
              if (isFinite(startAt)) {
                await currentActionLog.patch({ startAt, updatedAt: ctx.now });
              }

              break;
            }

            case "endAt": {
              const endAt = timeTextToEpochMs(ctx.store.store.editor.text);
              if (isFinite(endAt)) {
                await currentActionLog.patch({ endAt, updatedAt: ctx.now });
              }

              break;
            }
          }

          await ctx.store.updateStore((store) => {
            store.mode = "normal";
            store.editor.text = "";
          });

          break;
        }

        case "delete": {
          if (currentActionLog.text !== "") break;

          const items = await ctx.rxdb.collections.listItems.find({ selector: { parentId: currentActionLog.id } }).exec();
          if (items.length > 0) break;

          const aboveActionLog = await getAboveLog(ctx.rxdb, currentActionLog);
          if (!aboveActionLog) break;

          await ctx.store.updateStore((store) => {
            store.editor.initialPosition = "end";
            store.actionLogListPane.currentActionLogId = aboveActionLog.id;
          });

          await currentActionLog.remove();

          event.preventDefault();

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
