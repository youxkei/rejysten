import type { Context } from "@/services/eventEmitter/context";

export function emitActionLogListPaneEvent(ctx: Context, event: KeyboardEvent) {
  const { shiftKey, isComposing } = event;
  const actionLogListPaneEvent = { pane: "actionLogList" } as const;

  switch (ctx.store.mode) {
    case "normal": {
      const normalModeEvent = {
        ...actionLogListPaneEvent,
        mode: "normal",
      } as const;

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
            ctx.emitEvent({
              ...normalModeEvent,
              type: "enterInsertMode",
              focus: "text",
              cursorPosition: 0,
            });
            event.preventDefault();
          }

          break;
        }

        case "KeyA": {
          if (!shiftKey) {
            ctx.emitEvent({
              ...normalModeEvent,
              type: "enterInsertMode",
              focus: "text",
              cursorPosition: -1,
            });
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

        case "KeyS": {
          if (!shiftKey) {
            ctx.emitEvent({ ...normalModeEvent, type: "start" });
            event.preventDefault();
          }

          break;
        }

        case "KeyF": {
          if (!shiftKey) {
            ctx.emitEvent({ ...normalModeEvent, type: "finish" });
            event.preventDefault();
          }

          break;
        }

        case "KeyL": {
          if (!shiftKey) {
            ctx.emitEvent({ ...normalModeEvent, type: "moveToActionLogPane" });
            event.preventDefault();
          }
        }
      }

      break;
    }

    case "insert": {
      const insertModeEvent = {
        ...actionLogListPaneEvent,
        mode: "insert",
      } as const;
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

          ctx.emitEvent({
            ...insertModeEvent,
            type: "delete",
            preventDefault: () => event.preventDefault(),
          });

          break;
        }
      }

      break;
    }
  }
}
