import type { Event, ActionLogListPaneEvent, ActionLogPaneEvent, PaneEvent, EventService } from "@/services/event";
import type { RxDBService } from "@/services/rxdb";
import type { StoreService } from "@/services/store";
import type { JSXElement } from "solid-js";

import { Ulid } from "id128";
import { createEffect, untrack } from "solid-js";

import { ErrorWithFields, NeverErrorWithFields } from "@/error";
import { useEventService } from "@/services/event";
import { runWithLock, useLockService } from "@/services/lock";
import { useRxDBService } from "@/services/rxdb";
import { getAboveLog, getBelowLog } from "@/services/rxdb/collections/actionLog";
import { addNextSibling, addPrevSibling, dedent, getBelowItem, getAboveItem, indent } from "@/services/rxdb/collections/listItem";
import { useStoreService } from "@/services/store";
import { epochMsToTimeText, timeTextToEpochMs } from "@/temporal";

type Context = {
  now: number;

  rxdbService: RxDBService;
  storeService: StoreService;
  eventService: EventService;
};

export function EventHandlerServiceProvider(props: { children: JSXElement }) {
  const rxdbService = useRxDBService();
  const storeService = useStoreService();
  const lockService = useLockService();
  const eventService = useEventService();

  createEffect(async () => {
    const event = eventService.currentEvent$();
    if (event.kind === "initial") return;

    await untrack(() => runWithLock(lockService, () => handle({ now: Date.now(), rxdbService, storeService, eventService }, event)));
  });

  return props.children;
}

async function handle(ctx: Context, event: Event) {
  console.debug("event handler start", event);
  switch (event.kind) {
    case "initial": {
      // do nothing
      break;
    }

    case "pane": {
      await handlePaneEvent(ctx, event);

      break;
    }

    default: {
      throw new NeverErrorWithFields("unknown event.kind", { event }, event);
    }
  }
  console.debug("event handler end", event);
}

async function handlePaneEvent(ctx: Context, event: PaneEvent) {
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
}

async function handleActionLogListPaneEvent(ctx: Context, event: ActionLogListPaneEvent) {
  if (ctx.storeService.store.currentPane !== "actionLogList") {
    throw new ErrorWithFields("ActionLogListPaneEvent must be emitted when currentPane is actionLogList", { event, store: ctx.storeService.store });
  }

  const currentActionLog = await ctx.rxdbService.collections.actionLogs.findOne(ctx.storeService.store.actionLogListPane.currentActionLogId).exec();
  if (!currentActionLog) return;

  switch (event.mode) {
    case "normal": {
      if (ctx.storeService.store.mode !== "normal") {
        return;
      }

      switch (event.type) {
        case "moveAbove": {
          const aboveActionLog = await getAboveLog(ctx.rxdbService, currentActionLog);
          if (aboveActionLog) {
            await ctx.storeService.updateStore((store) => {
              store.actionLogListPane.currentActionLogId = aboveActionLog.id;
            });
          }

          break;
        }

        case "moveBelow": {
          const belowActionLog = await getBelowLog(ctx.rxdbService, currentActionLog);
          if (belowActionLog) {
            await ctx.storeService.updateStore((store) => {
              store.actionLogListPane.currentActionLogId = belowActionLog.id;
            });
          }

          break;
        }

        case "add": {
          const id = Ulid.generate({ time: ctx.now }).toCanonical();

          await ctx.rxdbService.collections.actionLogs.insert({
            id,
            text: "",
            startAt: currentActionLog.endAt || (ctx.now / 1000) * 1000,
            endAt: 0,
            updatedAt: ctx.now,
          });

          await ctx.storeService.updateStore((store) => {
            store.mode = "insert";
            store.editor.initialPosition = "end";
            store.actionLogListPane.currentActionLogId = id;
            store.actionLogListPane.focus = "text";
          });

          break;
        }

        case "focus": {
          const nextActionLog = await ctx.rxdbService.collections.actionLogs.findOne(event.actionLogId).exec();
          if (nextActionLog) {
            await ctx.storeService.updateStore((store) => {
              store.actionLogListPane.currentActionLogId = nextActionLog.id;
            });
          }

          break;
        }

        case "enterInsertMode": {
          await ctx.storeService.updateStore((store) => {
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

        case "enterActionLogPane": {
          // TODO
          break;
        }

        default: {
          throw new NeverErrorWithFields("unknown event.type", { event }, event);
        }
      }

      break;
    }

    case "insert": {
      if (ctx.storeService.store.mode !== "insert") {
        return;
      }

      switch (event.type) {
        case "changeEditorText": {
          switch (ctx.storeService.store.actionLogListPane.focus) {
            case "text": {
              await currentActionLog.patch({ text: event.newText, updatedAt: ctx.now });

              break;
            }

            case "startAt":
            case "endAt": {
              await ctx.storeService.updateStore((store) => {
                store.editor.text = event.newText;
              });

              break;
            }
          }

          break;
        }

        case "rotateFocus": {
          switch (ctx.storeService.store.actionLogListPane.focus) {
            case "startAt": {
              const startAt = timeTextToEpochMs(ctx.storeService.store.editor.text);
              if (isFinite(startAt)) {
                await currentActionLog.patch({ startAt, updatedAt: ctx.now });
              }

              break;
            }

            case "endAt": {
              const endAt = timeTextToEpochMs(ctx.storeService.store.editor.text);
              if (isFinite(endAt)) {
                await currentActionLog.patch({ endAt, updatedAt: ctx.now });
              }

              break;
            }
          }

          await ctx.storeService.updateStore((store) => {
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
          switch (ctx.storeService.store.actionLogListPane.focus) {
            case "startAt": {
              const startAt = timeTextToEpochMs(ctx.storeService.store.editor.text);
              if (isFinite(startAt)) {
                await currentActionLog.patch({ startAt, updatedAt: ctx.now });
              }

              break;
            }

            case "endAt": {
              const endAt = timeTextToEpochMs(ctx.storeService.store.editor.text);
              if (isFinite(endAt)) {
                await currentActionLog.patch({ endAt, updatedAt: ctx.now });
              }

              break;
            }
          }

          await ctx.storeService.updateStore((store) => {
            store.mode = "normal";
            store.editor.text = "";
          });

          break;
        }

        case "delete": {
          if (currentActionLog.text !== "") break;

          const items = await ctx.rxdbService.collections.listItems.find({ selector: { parentId: currentActionLog.id } }).exec();
          if (items.length > 0) break;

          const aboveActionLog = await getAboveLog(ctx.rxdbService, currentActionLog);
          if (!aboveActionLog) break;

          await ctx.storeService.updateStore((store) => {
            store.editor.initialPosition = "end";
            store.actionLogListPane.currentActionLogId = aboveActionLog.id;
          });

          await currentActionLog.remove();

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

async function handleActionLogPaneEvent(ctx: Context, event: ActionLogPaneEvent) {
  if (ctx.storeService.store.currentPane !== "actionLog") {
    throw new ErrorWithFields("ActionLogPaneEvent must be emitted when currentPane is actionLog", { event, store: ctx.storeService.store });
  }

  const currentListItem = await ctx.rxdbService.collections.listItems.findOne(ctx.storeService.store.actionLogPane.currentListItemId).exec();
  if (!currentListItem) return;

  switch (event.mode) {
    case "normal": {
      if (ctx.storeService.store.mode !== "normal") {
        return;
      }

      switch (event.type) {
        case "indent": {
          await indent(ctx.rxdbService, ctx.now, currentListItem);

          break;
        }

        case "dedent": {
          await dedent(ctx.rxdbService, ctx.now, currentListItem);

          break;
        }

        case "addPrev": {
          const id = Ulid.generate({ time: ctx.now }).toCanonical();

          await addPrevSibling(ctx.rxdbService, ctx.now, currentListItem, { id, text: "" });
          await ctx.storeService.updateStore((store) => {
            store.actionLogPane.currentListItemId = id;
          });

          break;
        }

        case "addNext": {
          const id = Ulid.generate({ time: ctx.now }).toCanonical();

          await addNextSibling(ctx.rxdbService, ctx.now, currentListItem, { id, text: "" });
          await ctx.storeService.updateStore((store) => {
            store.actionLogPane.currentListItemId = id;
          });

          break;
        }

        case "moveAbove": {
          const prevItem = await getAboveItem(ctx.rxdbService, currentListItem);
          if (prevItem) {
            await ctx.storeService.updateStore((store) => {
              store.actionLogPane.currentListItemId = prevItem.id;
            });
          }

          break;
        }

        case "moveBelow": {
          const nextItem = await getBelowItem(ctx.rxdbService, currentListItem);
          if (nextItem) {
            await ctx.storeService.updateStore((store) => {
              store.actionLogPane.currentListItemId = nextItem.id;
            });
          }

          break;
        }

        case "enterInsertMode": {
          await ctx.storeService.updateStore((store) => {
            store.mode = "insert";
            store.editor.initialPosition = event.initialPosition;
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
      if (ctx.storeService.store.mode !== "insert") {
        return;
      }

      switch (event.type) {
        case "changeEditorText": {
          await currentListItem.patch({ text: event.newText, updatedAt: ctx.now });

          break;
        }

        case "leaveInsertMode": {
          await ctx.storeService.updateStore((store) => {
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
