import type { Event, ActionLogListPaneEvent, ActionLogPaneEvent, PaneEvent, EventService } from "@/services/event";
import type { RxDBService } from "@/services/rxdb";
import type { StoreService } from "@/services/store";
import type { JSXElement } from "solid-js";

import { Temporal } from "@js-temporal/polyfill";
import { Ulid } from "id128";
import { createEffect, untrack } from "solid-js";

import { useEventService } from "@/services/event";
import { runWithLock, useLockService } from "@/services/lock";
import { useRxDBService } from "@/services/rxdb";
import { getAboveLog, getBelowLog } from "@/services/rxdb/collections/actionLog";
import { addNextSibling, addPrevSibling, dedent, getBelowItem, getAboveItem, indent } from "@/services/rxdb/collections/listItem";
import { useStoreService } from "@/services/store";

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

    await untrack(() => runWithLock(lockService, () => handle({ now: Date.now(), rxdbService, storeService, eventService }, event)));
  });

  return props.children;
}

async function handle(ctx: Context, event: Event) {
  switch (event.kind) {
    case "initial":
      // do nothing
      break;

    case "pane":
      await handlePaneEvent(ctx, event);

      break;
  }
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
  }
}

async function handleActionLogListPaneEvent(ctx: Context, event: ActionLogListPaneEvent) {
  if (ctx.storeService.store.currentPane !== "actionLogList") throw new Error("ActionLogListPaneEvent must be emitted when currentPane is actionLogList");

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

        case "enterInsertMode": {
          await ctx.storeService.updateStore((store) => {
            store.mode = "insert";
            store.actionLogListPane.focus = event.focus;
            store.editor.initialPosition = event.initialPosition;

            switch (event.focus) {
              case "start": {
                store.editor.text = toTimeText(currentActionLog.startAt);
                break;
              }

              case "end": {
                store.editor.text = toTimeText(currentActionLog.endAt);
                break;
              }
            }
          });

          break;
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
              await currentActionLog.patch({ text: event.newText });

              break;
            }

            case "start":
            case "end": {
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
            case "start": {
              await currentActionLog.patch({ startAt: parseTimeText(ctx.storeService.store.editor.text) });
              break;
            }

            case "end": {
              await currentActionLog.patch({ endAt: parseTimeText(ctx.storeService.store.editor.text) });
              break;
            }
          }

          await ctx.storeService.updateStore((store) => {
            switch (store.actionLogListPane.focus) {
              case "text": {
                store.actionLogListPane.focus = "start";
                store.editor.text = toTimeText(currentActionLog.startAt);
                break;
              }

              case "start": {
                store.actionLogListPane.focus = "end";
                store.editor.text = toTimeText(currentActionLog.endAt);
                break;
              }

              case "end": {
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
            case "start": {
              await currentActionLog.patch({ startAt: parseTimeText(ctx.storeService.store.editor.text) });
              break;
            }

            case "end": {
              await currentActionLog.patch({ endAt: parseTimeText(ctx.storeService.store.editor.text) });
              break;
            }
          }

          await ctx.storeService.updateStore((store) => {
            store.mode = "normal";
            store.editor.text = "";
          });
        }
      }
    }
  }
}

async function handleActionLogPaneEvent(ctx: Context, event: ActionLogPaneEvent) {
  if (ctx.storeService.store.currentPane !== "actionLog") throw new Error("ActionLogPaneEvent must be emitted when currentPane is actionLog");

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
      }

      break;
    }

    case "insert": {
      if (ctx.storeService.store.mode !== "insert") {
        return;
      }

      switch (event.type) {
        case "changeEditorText": {
          await currentListItem.patch({ text: event.newText });

          break;
        }

        case "leaveInsertMode": {
          await ctx.storeService.updateStore((store) => {
            store.mode = "normal";
          });

          break;
        }
      }
    }
  }
}

function parseTimeText(text: string) {
  if (text.length === 4 || text.length === 6) {
    const hour = Number(text.substring(0, 2));
    const minute = Number(text.substring(2, 4));
    const second = text.length === 6 ? Number(text.substring(4, 6)) : 0;

    if (hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59 && second >= 0 && second <= 59) {
      return new Temporal.PlainTime(hour, minute, second).toZonedDateTime({
        timeZone: Temporal.Now.timeZoneId(),
        plainDate: Temporal.Now.plainDateISO(),
      }).epochMilliseconds;
    }
  }

  return 0;
}

function toTimeText(epochMilliseconds: number) {
  if (epochMilliseconds === 0) return "";

  const time = Temporal.Instant.fromEpochMilliseconds(epochMilliseconds).toZonedDateTimeISO(Temporal.Now.timeZoneId());

  return `${time.hour.toString().padStart(2, "0")}${time.minute.toString().padStart(2, "0")}${time.second.toString().padStart(2, "0")}`;
}
