import { createCollections } from "@/rxdb/test";
import { createActionContext } from "@/actions/context";

import { RxDocument } from "rxdb";

import { ListItem } from "@/domain/listItem";
import { ActionContext } from "@/actions/context";

export async function addPrevSibling(
  ctx: ActionContext,
  baseItem: RxDocument<ListItem>,
  newItem: Omit<ListItem, "prevId" | "nextId" | "parentId" | "updatedAt">
) {
  if (newItem.id === "") {
    throw new Error(`newItem.id is empty. newItem: ${newItem}`);
  }

  const listItems = ctx.collections.listItems;
  const prevItem = await listItems.findOne(baseItem.prevId).exec();

  if (prevItem === null) {
    await Promise.all([
      listItems.insert({
        ...newItem,
        parentId: baseItem.parentId,
        prevId: "",
        nextId: baseItem.id,
        updatedAt: ctx.updateTime.getTime(),
      }),
      baseItem.update({ $set: { prevId: newItem.id, updatedAt: ctx.updateTime.getTime() } }),
    ]);
  } else {
    if (prevItem.nextId !== baseItem.id) {
      console.error("next item of prevItem is not baseItem", {
        baseItem: baseItem.toJSON(),
        prevItem: prevItem.toJSON(),
      });

      return;
    }

    if (prevItem.parentId !== baseItem.parentId) {
      console.error("", {
        baseItem: baseItem.toJSON(),
        prevItem: prevItem.toJSON(),
      });

      return;
    }

    await Promise.all([
      listItems.insert({
        ...newItem,
        parentId: baseItem.parentId,
        prevId: prevItem.id,
        nextId: baseItem.id,
        updatedAt: ctx.updateTime.getTime(),
      }),
      baseItem.update({ $set: { prevId: newItem.id, updatedAt: ctx.updateTime.getTime() } }),
      prevItem.update({ $set: { nextId: newItem.id, updatedAt: ctx.updateTime.getTime() } }),
    ]);
  }
}

export async function addNextSibling(
  ctx: ActionContext,
  baseItem: RxDocument<ListItem>,
  newItem: Omit<ListItem, "prevId" | "nextId" | "parentId" | "updatedAt">
) {
  if (newItem.id === "") {
    throw new Error(`newItem.id is empty. newItem: ${newItem}`);
  }

  const listItems = ctx.collections.listItems;
  const nextItem = await listItems.findOne(baseItem.nextId).exec();

  if (nextItem === null) {
    await Promise.all([
      listItems.insert({
        ...newItem,
        parentId: baseItem.parentId,
        prevId: baseItem.id,
        nextId: "",
        updatedAt: ctx.updateTime.getTime(),
      }),
      baseItem.update({ $set: { nextId: newItem.id, updatedAt: ctx.updateTime.getTime() } }),
    ]);
  } else {
    if (nextItem.prevId !== baseItem.id) {
      console.error("previous item of nextItem is not baseItem", {
        baseItem: baseItem.toJSON(),
        nextItem: nextItem.toJSON(),
      });

      return;
    }

    await Promise.all([
      listItems.insert({
        ...newItem,
        parentId: baseItem.parentId,
        prevId: baseItem.id,
        nextId: nextItem.id,
        updatedAt: ctx.updateTime.getTime(),
      }),
      baseItem.update({ $set: { nextId: newItem.id, updatedAt: ctx.updateTime.getTime() } }),
      nextItem.update({ $set: { prevId: newItem.id, updatedAt: ctx.updateTime.getTime() } }),
    ]);
  }
}

if (import.meta.vitest) {
  describe("addPrevSibling", () => {
    test("prepend", async (test) => {
      const tid = test.meta.id;
      let collections = await createCollections(tid);
      let listItems = collections.listItems;
      let ctx = createActionContext(collections);
      let updateTime = ctx.updateTime.getTime();

      await collections.listItems.bulkUpsert([
        { id: "1", text: "base", prevId: "", nextId: "", parentId: "0", updatedAt: 0 },
      ]);

      await addPrevSibling(ctx, (await collections.listItems.findOne("1").exec())!, {
        id: "2",
        text: "new",
      });

      test.expect((await listItems.find().exec()).map((x) => x.toJSON())).toEqual([
        { id: "1", text: "base", prevId: "2", nextId: "", parentId: "0", updatedAt: updateTime },
        { id: "2", text: "new", prevId: "", nextId: "1", parentId: "0", updatedAt: updateTime },
      ]);
    });

    test("insert", async (test) => {
      const tid = test.meta.id;
      let collections = await createCollections(tid);
      let listItems = collections.listItems;
      let ctx = createActionContext(collections);
      let updateTime = ctx.updateTime.getTime();

      await collections.listItems.bulkUpsert([
        { id: "1", text: "base", prevId: "2", nextId: "", parentId: "0", updatedAt: 0 },
        { id: "2", text: "prev", prevId: "", nextId: "1", parentId: "0", updatedAt: 0 },
      ]);

      await addPrevSibling(ctx, (await collections.listItems.findOne("1").exec())!, {
        id: "3",
        text: "new",
      });

      test.expect((await listItems.find().exec()).map((x) => x.toJSON())).toEqual([
        { id: "1", text: "base", prevId: "3", nextId: "", parentId: "0", updatedAt: updateTime },
        { id: "2", text: "prev", prevId: "", nextId: "3", parentId: "0", updatedAt: updateTime },
        { id: "3", text: "new", prevId: "2", nextId: "1", parentId: "0", updatedAt: updateTime },
      ]);
    });
  });

  describe("addNextSibling", () => {
    test("append", async (test) => {
      const tid = test.meta.id;
      let collections = await createCollections(tid);
      let listItems = collections.listItems;
      let ctx = createActionContext(collections);
      let updateTime = ctx.updateTime.getTime();

      await collections.listItems.bulkUpsert([
        { id: "1", text: "base", prevId: "", nextId: "", parentId: "0", updatedAt: 0 },
      ]);

      await addNextSibling(ctx, (await collections.listItems.findOne("1").exec())!, {
        id: "2",
        text: "new",
      });

      test.expect((await listItems.find().exec()).map((x) => x.toJSON())).toEqual([
        { id: "1", text: "base", prevId: "", nextId: "2", parentId: "0", updatedAt: updateTime },
        { id: "2", text: "new", prevId: "1", nextId: "", parentId: "0", updatedAt: updateTime },
      ]);
    });

    test("insert", async (test) => {
      const tid = test.meta.id;
      let collections = await createCollections(tid);
      let listItems = collections.listItems;
      let ctx = createActionContext(collections);
      let updateTime = ctx.updateTime.getTime();

      await collections.listItems.bulkUpsert([
        { id: "1", text: "base", prevId: "", nextId: "2", parentId: "0", updatedAt: 0 },
        { id: "2", text: "next", prevId: "1", nextId: "", parentId: "0", updatedAt: 0 },
      ]);

      await addNextSibling(ctx, (await collections.listItems.findOne("1").exec())!, {
        id: "3",
        text: "new",
      });

      test.expect((await listItems.find().exec()).map((x) => x.toJSON())).toEqual([
        { id: "1", text: "base", prevId: "", nextId: "3", parentId: "0", updatedAt: updateTime },
        { id: "2", text: "next", prevId: "3", nextId: "", parentId: "0", updatedAt: updateTime },
        { id: "3", text: "new", prevId: "1", nextId: "2", parentId: "0", updatedAt: updateTime },
      ]);
    });
  });
}
