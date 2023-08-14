import type { Context } from "@/services/eventEmitter/context";

export function emitActionLogPaneEvent(ctx: Context, event: KeyboardEvent) {
  switch (ctx.state.mode) {
    case "normal": {
      emitNormalModeEvent(ctx, event);

      break;
    }

    case "insert": {
      emitInsertModeEvent(ctx, event);

      break;
    }
  }
}

function emitNormalModeEvent(ctx: Context, event: KeyboardEvent) {
  const { shiftKey } = event;
  const baseEvent = { pane: "actionLog", mode: "normal" } as const;

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

      ctx.emitEvent({
        ...baseEvent,
        type: "enterInsertMode",
        cursorPosition: 0,
      });
      event.preventDefault();

      break;
    }

    case "KeyA": {
      if (shiftKey) break;

      ctx.emitEvent({
        ...baseEvent,
        type: "enterInsertMode",
        cursorPosition: -1,
      });
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

function emitInsertModeEvent(ctx: Context, event: KeyboardEvent) {
  const { shiftKey, isComposing } = event;
  const baseEvent = { pane: "actionLog", mode: "insert" } as const;

  switch (event.code) {
    case "Tab": {
      if (isComposing) break;

      if (shiftKey) {
        ctx.emitEvent({ ...baseEvent, type: "dedent" });
      } else {
        ctx.emitEvent({ ...baseEvent, type: "indent" });
      }
      event.preventDefault();

      break;
    }

    case "Escape": {
      if (shiftKey || isComposing) break;

      ctx.emitEvent({ ...baseEvent, type: "leaveInsertMode" });
      event.preventDefault();

      break;
    }

    case "Enter": {
      if (shiftKey || isComposing) break;

      ctx.emitEvent({
        ...baseEvent,
        type: "add",
        preventDefault: () => event.preventDefault(),
      });

      break;
    }

    case "Backspace": {
      if (shiftKey || isComposing) break;

      ctx.emitEvent({
        ...baseEvent,
        type: "delete",
        preventDefault: () => event.preventDefault(),
      });

      break;
    }

    case "Delete": {
      if (shiftKey || isComposing) break;

      ctx.emitEvent({
        ...baseEvent,
        type: "deleteBelow",
        preventDefault: () => event.preventDefault(),
      });

      break;
    }
  }
}
