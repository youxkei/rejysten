import type { ActionLogListPaneEvent } from "@/services/event";
import type { Context } from "@/services/eventHandler/context";

import { Ulid } from "id128";

import { ErrorWithFields, NeverErrorWithFields } from "@/error";
import { getAboveLog, getBelowLog } from "@/services/rxdb/collections/actionLog";
import { epochMsToTimeText, timeTextToEpochMs } from "@/temporal";

export async function handleActionLogListPaneEvent(ctx: Context, event: ActionLogListPaneEvent) {
  if (ctx.store.state.currentPane !== "actionLogList") {
    throw new ErrorWithFields("ActionLogListPaneEvent must be emitted when currentPane is actionLogList", {
      event,
      state: ctx.store.state,
    });
  }

  const currentActionLog = await ctx.rxdb.collections.actionLogs
    .findOne(ctx.store.state.actionLogListPane.currentActionLogId)
    .exec();

  switch (event.mode) {
    case "normal": {
      if (ctx.store.state.mode !== "normal") break;

      switch (event.type) {
        case "moveAbove": {
          if (!currentActionLog) break;

          const aboveActionLog = await getAboveLog(ctx.rxdb, currentActionLog);
          if (aboveActionLog) {
            ctx.store.updateState((state) => {
              state.actionLogListPane.currentActionLogId = aboveActionLog.id;
            });
          }

          break;
        }

        case "moveBelow": {
          if (!currentActionLog) break;

          const belowActionLog = await getBelowLog(ctx.rxdb, currentActionLog);
          if (belowActionLog) {
            ctx.store.updateState((state) => {
              state.actionLogListPane.currentActionLogId = belowActionLog.id;
            });
          }

          break;
        }

        case "add": {
          const id = Ulid.generate({ time: ctx.now }).toCanonical();

          await ctx.rxdb.collections.actionLogs.insert({
            id,
            text: "",
            startAt: (currentActionLog?.endAt ?? 0) || (ctx.now / 1000) * 1000,
            endAt: 0,
            updatedAt: ctx.now,
          });

          ctx.store.updateState((state) => {
            state.mode = "insert";
            state.editor.text = "";
            state.editor.cursorPosition = -1;
            state.actionLogListPane.currentActionLogId = id;
            state.actionLogListPane.focus = "text";
          });

          break;
        }

        case "focus": {
          const nextActionLog = await ctx.rxdb.collections.actionLogs.findOne(event.actionLogId).exec();
          if (nextActionLog) {
            ctx.store.updateState((state) => {
              state.actionLogListPane.currentActionLogId = nextActionLog.id;
            });
          }

          break;
        }

        case "enterInsertMode": {
          if (!currentActionLog) break;

          ctx.store.updateState((state) => {
            state.mode = "insert";
            state.actionLogListPane.focus = event.focus;
            state.editor.cursorPosition = event.cursorPosition;

            switch (event.focus) {
              case "text": {
                state.editor.text = currentActionLog.text;
                break;
              }

              case "startAt": {
                state.editor.text = epochMsToTimeText(currentActionLog.startAt, true);
                break;
              }

              case "endAt": {
                state.editor.text = epochMsToTimeText(currentActionLog.endAt, true);
                break;
              }
            }
          });

          break;
        }

        case "start": {
          if (!currentActionLog) break;
          if (currentActionLog.startAt !== 0) break;

          const aboveActionLog = await getAboveLog(ctx.rxdb, currentActionLog);

          if (aboveActionLog && aboveActionLog.endAt > 0) {
            await currentActionLog.patch({
              startAt: aboveActionLog.endAt,
              updatedAt: ctx.now,
            });
          } else {
            await currentActionLog.patch({
              startAt: (ctx.now / 1000) * 1000,
              updatedAt: ctx.now,
            });
          }

          break;
        }

        case "finish": {
          if (!currentActionLog) break;
          if (currentActionLog.endAt !== 0) break;

          await currentActionLog.patch({
            endAt: (ctx.now / 1000) * 1000,
            updatedAt: ctx.now,
          });

          break;
        }

        case "moveToActionLogPane": {
          if (!currentActionLog) break;

          ctx.store.updateState((state) => {
            state.currentPane = "actionLog";
            state.actionLogPane.currentListItemId = "";
            state.actionLogPane.currentActionLogId = currentActionLog.id;
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
      if (ctx.store.state.mode !== "insert") break;
      if (!currentActionLog) break;

      switch (event.type) {
        case "changeEditorText": {
          switch (ctx.store.state.actionLogListPane.focus) {
            case "text": {
              await currentActionLog.patch({
                text: ctx.store.state.editor.text,
                updatedAt: ctx.now,
              });

              break;
            }

            case "startAt":
            case "endAt": {
              // do nothing because saving startAt and endAt partially cause undesirable behavior
              break;
            }
          }

          break;
        }

        case "rotateFocus": {
          switch (ctx.store.state.actionLogListPane.focus) {
            case "startAt": {
              const startAt = timeTextToEpochMs(ctx.store.state.editor.text);
              if (isFinite(startAt)) {
                await currentActionLog.patch({ startAt, updatedAt: ctx.now });
              }

              break;
            }

            case "endAt": {
              const endAt = timeTextToEpochMs(ctx.store.state.editor.text);
              if (isFinite(endAt)) {
                await currentActionLog.patch({ endAt, updatedAt: ctx.now });
              }

              break;
            }
          }

          ctx.store.updateState((state) => {
            switch (state.actionLogListPane.focus) {
              case "text": {
                state.actionLogListPane.focus = "startAt";
                state.editor.text = epochMsToTimeText(currentActionLog.startAt, true);

                break;
              }

              case "startAt": {
                state.actionLogListPane.focus = "endAt";
                state.editor.text = epochMsToTimeText(currentActionLog.endAt, true);

                break;
              }

              case "endAt": {
                state.actionLogListPane.focus = "text";
                state.editor.text = currentActionLog.text;

                break;
              }
            }
          });

          break;
        }

        case "leaveInsertMode": {
          switch (ctx.store.state.actionLogListPane.focus) {
            case "text": {
              await currentActionLog.patch({ text: ctx.store.state.editor.text, updatedAt: ctx.now });

              break;
            }

            case "startAt": {
              const startAt = timeTextToEpochMs(ctx.store.state.editor.text);
              if (isFinite(startAt)) {
                await currentActionLog.patch({ startAt, updatedAt: ctx.now });
              }

              break;
            }

            case "endAt": {
              const endAt = timeTextToEpochMs(ctx.store.state.editor.text);
              if (isFinite(endAt)) {
                await currentActionLog.patch({ endAt, updatedAt: ctx.now });
              }

              break;
            }
          }

          ctx.store.updateState((state) => {
            state.mode = "normal";
            state.editor.text = "";
          });

          break;
        }

        case "delete": {
          const items = await ctx.rxdb.collections.listItems
            .find({ selector: { parentId: currentActionLog.id } })
            .exec();
          if (items.length > 0) break;

          const aboveActionLog = await getAboveLog(ctx.rxdb, currentActionLog);
          if (!aboveActionLog) break;

          ctx.store.updateState((state) => {
            state.editor.text = aboveActionLog.text;
            state.editor.cursorPosition = -1;
            state.actionLogListPane.currentActionLogId = aboveActionLog.id;
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
