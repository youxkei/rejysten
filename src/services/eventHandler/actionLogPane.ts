import type { ActionLogPaneEvent } from "@/services/event";
import type { Context } from "@/services/eventHandler/context";
import type { ListItemDocument } from "@/services/rxdb/collections/listItem";

import { Ulid } from "id128";

import { ErrorWithFields, NeverErrorWithFields } from "@/error";
import {
  addNextSibling,
  addPrevSibling,
  dedent,
  getBelowItem,
  getAboveItem,
  indent,
  remove,
} from "@/services/rxdb/collections/listItem";

export async function handleActionLogPaneEvent(ctx: Context, event: ActionLogPaneEvent) {
  if (ctx.store.store.currentPane !== "actionLog") {
    throw new ErrorWithFields("ActionLogPaneEvent must be emitted when currentPane is actionLog", {
      event,
      store: ctx.store.store,
    });
  }

  const currentListItem = await ctx.rxdb.collections.listItems
    .findOne(ctx.store.store.actionLogPane.currentListItemId)
    .exec();
  if (!currentListItem) return;

  switch (event.mode) {
    case "normal": {
      if (ctx.store.store.mode !== "normal") return;

      await handleNormalModeEvent(ctx, currentListItem, event);

      break;
    }

    case "insert": {
      if (ctx.store.store.mode !== "insert") return;

      await handleInsertModeEvent(ctx, currentListItem, event);

      break;
    }

    default: {
      throw new NeverErrorWithFields("unknown event.mode", { event }, event);
    }
  }
}

async function handleNormalModeEvent(
  ctx: Context,
  currentListItem: ListItemDocument,
  event: ActionLogPaneEvent & { mode: "normal" }
) {
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

      await addPrevSibling(ctx.rxdb, ctx.now, currentListItem, {
        id,
        text: "",
      });
      await ctx.store.updateStore((store) => {
        store.mode = "insert";
        store.editor.cursorPosition = 0;
        store.actionLogPane.currentListItemId = id;
      });

      break;
    }

    case "addNext": {
      const id = Ulid.generate({ time: ctx.now }).toCanonical();

      await addNextSibling(ctx.rxdb, ctx.now, currentListItem, {
        id,
        text: "",
      });
      await ctx.store.updateStore((store) => {
        store.mode = "insert";
        store.editor.cursorPosition = 0;
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
        store.editor.cursorPosition = event.cursorPosition;
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
}

async function handleInsertModeEvent(
  ctx: Context,
  currentListItem: ListItemDocument,
  event: ActionLogPaneEvent & { mode: "insert" }
) {
  switch (event.type) {
    case "leaveInsertMode": {
      await ctx.store.updateStore((store) => {
        store.mode = "normal";
      });

      break;
    }

    case "indent": {
      const inputElement = window.document.activeElement as HTMLInputElement | null;
      if (
        !inputElement ||
        inputElement.tagName !== "INPUT" ||
        inputElement.selectionStart === null ||
        inputElement.selectionStart !== inputElement.selectionEnd
      ) {
        break;
      }

      const cursorPosition = inputElement.selectionStart;

      await indent(ctx.rxdb, ctx.now, currentListItem);
      await ctx.store.updateStore((store) => {
        store.editor.cursorPosition = cursorPosition;
      });

      break;
    }

    case "dedent": {
      const inputElement = window.document.activeElement as HTMLInputElement | null;
      if (
        !inputElement ||
        inputElement.tagName !== "INPUT" ||
        inputElement.selectionStart === null ||
        inputElement.selectionStart !== inputElement.selectionEnd
      ) {
        break;
      }

      const cursorPosition = inputElement.selectionStart;

      await dedent(ctx.rxdb, ctx.now, currentListItem);
      await ctx.store.updateStore((store) => {
        store.editor.cursorPosition = cursorPosition;
      });

      break;
    }

    case "add": {
      const inputElement = window.document.activeElement as HTMLInputElement | null;
      if (
        !inputElement ||
        inputElement.tagName !== "INPUT" ||
        inputElement.selectionStart === null ||
        inputElement.selectionStart !== inputElement.selectionEnd
      ) {
        break;
      }

      const id = Ulid.generate({ time: ctx.now }).toCanonical();
      const textBeforeCursor = currentListItem.text.substring(0, inputElement.selectionStart);
      const textAfterCursor = currentListItem.text.substring(inputElement.selectionStart);

      await addNextSibling(ctx.rxdb, ctx.now, currentListItem, {
        id,
        text: textAfterCursor,
      });

      const newCurrentListItem = currentListItem.getLatest();
      await newCurrentListItem.patch({
        text: textBeforeCursor,
        updatedAt: ctx.now,
      });

      await ctx.store.updateStore((store) => {
        store.editor.cursorPosition = 0;
        store.actionLogPane.currentListItemId = id;
      });

      event.preventDefault();

      break;
    }

    case "delete": {
      const inputElement = window.document.activeElement as HTMLInputElement | null;
      if (
        !inputElement ||
        inputElement.tagName !== "INPUT" ||
        inputElement.selectionStart === null ||
        inputElement.selectionStart !== inputElement.selectionEnd ||
        inputElement.selectionStart !== 0
      ) {
        break;
      }

      const childrenItems = await ctx.rxdb.collections.listItems
        .find({ selector: { parentId: currentListItem.id } })
        .exec();
      if (childrenItems.length > 0) break;

      if (
        currentListItem.text === "" &&
        currentListItem.prevId === "" &&
        currentListItem.nextId === "" &&
        currentListItem.parentId === ctx.store.store.actionLogPane.currentActionLogId
      ) {
        await ctx.store.updateStore((store) => {
          store.editor.cursorPosition = -1;
          store.currentPane = "actionLogList";
          store.actionLogListPane.focus = "text";
        });

        await currentListItem.remove();
      } else {
        const aboveListItem = await getAboveItem(ctx.rxdb, currentListItem);
        if (!aboveListItem) break;

        await aboveListItem.patch({
          text: aboveListItem.text + currentListItem.text,
          updatedAt: ctx.now,
        });

        await ctx.store.updateStore((store) => {
          store.editor.cursorPosition = aboveListItem.text.length;
          store.actionLogPane.currentListItemId = aboveListItem.id;
        });

        await remove(ctx.rxdb, ctx.now, currentListItem);
      }

      event.preventDefault();

      break;
    }

    case "deleteBelow": {
      const inputElement = window.document.activeElement as HTMLInputElement | null;
      if (
        !inputElement ||
        inputElement.tagName !== "INPUT" ||
        inputElement.selectionStart === null ||
        inputElement.selectionStart !== inputElement.selectionEnd ||
        inputElement.selectionStart !== currentListItem.text.length
      ) {
        break;
      }

      const belowListItem = await getBelowItem(ctx.rxdb, currentListItem);
      if (!belowListItem) break;

      const childrenItemsOfBelowListItem = await ctx.rxdb.collections.listItems
        .find({ selector: { parentId: belowListItem.id } })
        .exec();
      if (childrenItemsOfBelowListItem.length > 0) break;

      await remove(ctx.rxdb, ctx.now, belowListItem);
      const newCurrentListItem = currentListItem.getLatest();
      await newCurrentListItem.patch({
        text: newCurrentListItem.text + belowListItem.text,
        updatedAt: ctx.now,
      });

      await ctx.store.updateStore((store) => {
        store.editor.cursorPosition = currentListItem.text.length;
      });

      event.preventDefault();

      break;
    }

    case "changeEditorText": {
      await currentListItem.patch({ text: event.newText, updatedAt: ctx.now });

      break;
    }

    default: {
      throw new NeverErrorWithFields("unknown event.type", { event }, event);
    }
  }
}
