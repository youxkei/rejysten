import { createCollections } from "@/rxdb/test";
import { createActionContext } from "@/actions/context";

import { RxDocument } from "rxdb";

import { ListItem } from "@/domain/listItem";
import { ActionContext } from "@/actions/context";
import { InconsistentError } from "@/actions/error";

async function getPrevItem(ctx: ActionContext, baseItem: RxDocument<ListItem>) {
  const listItems = ctx.collections.listItems;
  let prevItem: RxDocument<ListItem> | undefined;

  if (baseItem.prevId !== "") {
    prevItem = (await listItems.findOne(baseItem.prevId).exec()) ?? undefined;

    if (!prevItem) {
      throw new InconsistentError("baseItem.prevId is invalid", { baseItem: baseItem.toJSON() });
    }

    if (prevItem.nextId !== baseItem.id) {
      throw new InconsistentError("prevItem.nextId is not baseItem.id", {
        baseItem: baseItem.toJSON(),
        prevItem: prevItem.toJSON(),
      });
    }

    if (prevItem.parentId !== baseItem.parentId) {
      throw new InconsistentError("prevItem.parentId is not baseItem.parentId", {
        baseItem: baseItem.toJSON(),
        prevItem: prevItem.toJSON(),
      });
    }
  }

  return prevItem;
}

async function getNextItem(ctx: ActionContext, baseItem: RxDocument<ListItem>) {
  const listItems = ctx.collections.listItems;
  let nextItem: RxDocument<ListItem> | undefined;

  if (baseItem.nextId !== "") {
    nextItem = (await listItems.findOne(baseItem.nextId).exec()) ?? undefined;

    if (!nextItem) {
      throw new InconsistentError("baseItem.nextId is invalid", { baseItem: baseItem.toJSON() });
    }

    if (nextItem.prevId !== baseItem.id) {
      throw new InconsistentError("nextItem.prevId is not baseItem.id", {
        baseItem: baseItem.toJSON(),
        nextItem: nextItem.toJSON(),
      });
    }

    if (nextItem.parentId !== baseItem.parentId) {
      throw new InconsistentError("nextItem.parentId is not baseItem.parentId", {
        baseItem: baseItem.toJSON(),
        nextItem: nextItem.toJSON(),
      });
    }
  }

  return nextItem;
}

async function getParentItem(ctx: ActionContext, baseItem: RxDocument<ListItem>) {
  const listItems = ctx.collections.listItems;
  let parentItem: RxDocument<ListItem> | undefined;

  if (baseItem.parentId !== "") {
    parentItem = (await listItems.findOne(baseItem.parentId).exec()) ?? undefined;

    if (!parentItem) {
      // this is normal situation because parentId may refer to an item of another collection
      return;
    }
  }

  return parentItem;
}

async function getLastChildItem(ctx: ActionContext, baseItem: RxDocument<ListItem>) {
  const listItems = ctx.collections.listItems;

  const lastChildItems = await listItems
    .find({
      selector: {
        parentId: baseItem.id,
        nextId: "",
      },
    })
    .exec();

  if (lastChildItems.length > 1) {
    throw new InconsistentError("there are many last child items", {
      baseItem: baseItem.toJSON(),
      lastChildItems: lastChildItems.map((item) => item.toJSON()),
    });
  }

  if (lastChildItems.length === 0) {
    return;
  }

  return lastChildItems[0];
}

async function unlinkFromSiblings(ctx: ActionContext, item: RxDocument<ListItem>) {
  const [prevItem, nextItem] = await Promise.all([getPrevItem(ctx, item), getNextItem(ctx, item)]);

  return Promise.all([
    ...(prevItem
      ? [
        prevItem.patch({
          nextId: nextItem?.id ?? "",
          updatedAt: ctx.now,
        }),
      ]
      : []),
    ...(nextItem
      ? [
        nextItem.patch({
          prevId: prevItem?.id ?? "",
          updatedAt: ctx.now,
        }),
      ]
      : []),
  ]);
}

function isRxDocument<T>(
  document: Omit<T, "parentId" | "prevId" | "nextId" | "updatedAt"> | RxDocument<T>
): document is RxDocument<T> {
  return "isInstanceOfRxDocument" in document;
}

export async function addPrevSibling(
  ctx: ActionContext,
  baseItem: RxDocument<ListItem>,
  newItem: Omit<ListItem, "parentId" | "prevId" | "nextId" | "updatedAt"> | RxDocument<ListItem>
) {
  if (newItem.id === "") {
    throw new Error(`newItem.id is empty. newItem: ${newItem}`);
  }

  const listItems = ctx.collections.listItems;
  const prevItem = await getPrevItem(ctx, baseItem);

  if (!prevItem) {
    return Promise.all([
      isRxDocument(newItem)
        ? newItem.patch({
          parentId: baseItem.parentId,
          prevId: "",
          nextId: baseItem.id,
          updatedAt: ctx.now,
        })
        : listItems.insert({
          ...newItem,
          parentId: baseItem.parentId,
          prevId: "",
          nextId: baseItem.id,
          updatedAt: ctx.now,
        }),
      baseItem.patch({ prevId: newItem.id, updatedAt: ctx.now }),
    ]);
  }

  return Promise.all([
    isRxDocument(newItem)
      ? newItem.patch({
        parentId: baseItem.parentId,
        prevId: prevItem.id,
        nextId: baseItem.id,
        updatedAt: ctx.now,
      })
      : listItems.insert({
        ...newItem,
        parentId: baseItem.parentId,
        prevId: prevItem.id,
        nextId: baseItem.id,
        updatedAt: ctx.now,
      }),
    baseItem.patch({ prevId: newItem.id, updatedAt: ctx.now }),
    prevItem.patch({ nextId: newItem.id, updatedAt: ctx.now }),
  ]);
}

if (import.meta.vitest) {
  describe("addPrevSibling", () => {
    test("prepend", async (test) => {
      const tid = test.meta.id;
      let collections = await createCollections(tid);
      let listItems = collections.listItems;
      let now = Date.now();
      let ctx = createActionContext(collections, now);

      await collections.listItems.bulkUpsert([
        { id: "1", text: "base", prevId: "", nextId: "", parentId: "0", updatedAt: 0 },
      ]);

      await addPrevSibling(ctx, (await collections.listItems.findOne("1").exec())!, {
        id: "2",
        text: "new",
      });

      test.expect((await listItems.find().exec()).map((x) => x.toJSON())).toEqual([
        { id: "1", text: "base", prevId: "2", nextId: "", parentId: "0", updatedAt: now },
        { id: "2", text: "new", prevId: "", nextId: "1", parentId: "0", updatedAt: now },
      ]);
    });

    test("insert", async (test) => {
      const tid = test.meta.id;
      let collections = await createCollections(tid);
      let listItems = collections.listItems;
      let now = Date.now();
      let ctx = createActionContext(collections, now);

      await collections.listItems.bulkUpsert([
        { id: "1", text: "base", prevId: "2", nextId: "", parentId: "0", updatedAt: 0 },
        { id: "2", text: "prev", prevId: "", nextId: "1", parentId: "0", updatedAt: 0 },
      ]);

      await addPrevSibling(ctx, (await collections.listItems.findOne("1").exec())!, {
        id: "3",
        text: "new",
      });

      test.expect((await listItems.find().exec()).map((x) => x.toJSON())).toEqual([
        { id: "1", text: "base", prevId: "3", nextId: "", parentId: "0", updatedAt: now },
        { id: "2", text: "prev", prevId: "", nextId: "3", parentId: "0", updatedAt: now },
        { id: "3", text: "new", prevId: "2", nextId: "1", parentId: "0", updatedAt: now },
      ]);
    });
  });
}

export async function addNextSibling(
  ctx: ActionContext,
  baseItem: RxDocument<ListItem>,
  newItem: Omit<ListItem, "parentId" | "prevId" | "nextId" | "updatedAt"> | RxDocument<ListItem>
) {
  if (newItem.id === "") {
    throw new Error(`newItem.id is empty. newItem: ${newItem}`);
  }

  const listItems = ctx.collections.listItems;
  const nextItem = await getNextItem(ctx, baseItem);

  if (!nextItem) {
    return Promise.all([
      isRxDocument(newItem)
        ? newItem.patch({
          parentId: baseItem.parentId,
          prevId: baseItem.id,
          nextId: "",
          updatedAt: ctx.now,
        })
        : listItems.insert({
          ...newItem,
          parentId: baseItem.parentId,
          prevId: baseItem.id,
          nextId: "",
          updatedAt: ctx.now,
        }),
      baseItem.patch({ nextId: newItem.id, updatedAt: ctx.now }),
    ]);
  }

  return Promise.all([
    isRxDocument(newItem)
      ? newItem.patch({
        parentId: baseItem.parentId,
        prevId: baseItem.id,
        nextId: nextItem.id,
        updatedAt: ctx.now,
      })
      : listItems.insert({
        ...newItem,
        parentId: baseItem.parentId,
        prevId: baseItem.id,
        nextId: nextItem.id,
        updatedAt: ctx.now,
      }),
    baseItem.patch({ nextId: newItem.id, updatedAt: ctx.now }),
    nextItem.patch({ prevId: newItem.id, updatedAt: ctx.now }),
  ]);
}

if (import.meta.vitest) {
  describe("addNextSibling", () => {
    test("append", async (test) => {
      const tid = test.meta.id;
      let collections = await createCollections(tid);
      let listItems = collections.listItems;
      let now = Date.now();
      let ctx = createActionContext(collections, now);

      await collections.listItems.bulkUpsert([
        { id: "1", text: "base", prevId: "", nextId: "", parentId: "0", updatedAt: 0 },
      ]);

      await addNextSibling(ctx, (await collections.listItems.findOne("1").exec())!, {
        id: "2",
        text: "new",
      });

      test.expect((await listItems.find().exec()).map((x) => x.toJSON())).toEqual([
        { id: "1", text: "base", prevId: "", nextId: "2", parentId: "0", updatedAt: now },
        { id: "2", text: "new", prevId: "1", nextId: "", parentId: "0", updatedAt: now },
      ]);
    });

    test("insert", async (test) => {
      const tid = test.meta.id;
      let collections = await createCollections(tid);
      let listItems = collections.listItems;
      let now = Date.now();
      let ctx = createActionContext(collections, now);

      await collections.listItems.bulkUpsert([
        { id: "1", text: "base", prevId: "", nextId: "2", parentId: "0", updatedAt: 0 },
        { id: "2", text: "next", prevId: "1", nextId: "", parentId: "0", updatedAt: 0 },
      ]);

      await addNextSibling(ctx, (await collections.listItems.findOne("1").exec())!, {
        id: "3",
        text: "new",
      });

      test.expect((await listItems.find().exec()).map((x) => x.toJSON())).toEqual([
        { id: "1", text: "base", prevId: "", nextId: "3", parentId: "0", updatedAt: now },
        { id: "2", text: "next", prevId: "3", nextId: "", parentId: "0", updatedAt: now },
        { id: "3", text: "new", prevId: "1", nextId: "2", parentId: "0", updatedAt: now },
      ]);
    });
  });
}

export async function indent(ctx: ActionContext, item: RxDocument<ListItem>) {
  const prevItem = await getPrevItem(ctx, item);
  if (!prevItem) return;

  const lastChildItemOfPrevItem = await getLastChildItem(ctx, prevItem);

  return Promise.all([
    unlinkFromSiblings(ctx, item),
    lastChildItemOfPrevItem
      ? addNextSibling(ctx, lastChildItemOfPrevItem, item)
      : item.patch({
        parentId: prevItem.id,
        prevId: "",
        nextId: "",
        updatedAt: ctx.now,
      }),
  ]);
}

if (import.meta.vitest) {
  describe("indent", () => {
    test("cannot indent due to no prev item", async (test) => {
      const tid = test.meta.id;
      let collections = await createCollections(tid);
      let ctx = createActionContext(collections, Date.now());

      await collections.listItems.bulkUpsert([
        { id: "1", text: "target", prevId: "", nextId: "2", parentId: "0", updatedAt: 0 },
        { id: "2", text: "next", prevId: "1", nextId: "", parentId: "0", updatedAt: 0 },
      ]);

      await indent(ctx, (await collections.listItems.findOne("1").exec())!);

      test.expect((await collections.listItems.find().exec()).map((x) => x.toJSON())).toEqual([
        { id: "1", text: "target", prevId: "", nextId: "2", parentId: "0", updatedAt: 0 },
        { id: "2", text: "next", prevId: "1", nextId: "", parentId: "0", updatedAt: 0 },
      ]);
    });

    test("indent with prev item without children", async (test) => {
      const tid = test.meta.id;
      let collections = await createCollections(tid);
      let now = Date.now();
      let ctx = createActionContext(collections, now);

      await collections.listItems.bulkUpsert([
        { id: "1", text: "prev", prevId: "", nextId: "2", parentId: "0", updatedAt: 0 },
        { id: "2", text: "target", prevId: "1", nextId: "3", parentId: "0", updatedAt: 0 },
        { id: "3", text: "next", prevId: "2", nextId: "", parentId: "0", updatedAt: 0 },
      ]);

      await indent(ctx, (await collections.listItems.findOne("2").exec())!);

      test.expect((await collections.listItems.find().exec()).map((x) => x.toJSON())).toEqual([
        { id: "1", text: "prev", prevId: "", nextId: "3", parentId: "0", updatedAt: now },
        { id: "2", text: "target", prevId: "", nextId: "", parentId: "1", updatedAt: now },
        { id: "3", text: "next", prevId: "1", nextId: "", parentId: "0", updatedAt: now },
      ]);
    });

    test("indent with prev item with children", async (test) => {
      const tid = test.meta.id;
      let collections = await createCollections(tid);
      let now = Date.now();
      let ctx = createActionContext(collections, now);

      await collections.listItems.bulkUpsert([
        { id: "1", text: "prev", prevId: "", nextId: "3", parentId: "0", updatedAt: 0 },
        { id: "2", text: "child of prev", prevId: "", nextId: "", parentId: "1", updatedAt: 0 },
        { id: "3", text: "target", prevId: "1", nextId: "4", parentId: "0", updatedAt: 0 },
        { id: "4", text: "next", prevId: "3", nextId: "", parentId: "0", updatedAt: 0 },
      ]);

      await indent(ctx, (await collections.listItems.findOne("3").exec())!);

      test.expect((await collections.listItems.find().exec()).map((x) => x.toJSON())).toEqual([
        { id: "1", text: "prev", prevId: "", nextId: "4", parentId: "0", updatedAt: now },
        { id: "2", text: "child of prev", prevId: "", nextId: "3", parentId: "1", updatedAt: now },
        { id: "3", text: "target", prevId: "2", nextId: "", parentId: "1", updatedAt: now },
        { id: "4", text: "next", prevId: "1", nextId: "", parentId: "0", updatedAt: now },
      ]);
    });
  });
}

export async function dedent(ctx: ActionContext, item: RxDocument<ListItem>) {
  const parentItem = await getParentItem(ctx, item);
  if (!parentItem) return;

  return Promise.all([unlinkFromSiblings(ctx, item), addNextSibling(ctx, parentItem, item)]);
}

if (import.meta.vitest) {
  describe("dedent", () => {
    test("cannot dedent due to no parent item", async (test) => {
      const tid = test.meta.id;
      let collections = await createCollections(tid);
      let ctx = createActionContext(collections, Date.now());

      await collections.listItems.bulkUpsert([
        { id: "1", text: "prev", prevId: "", nextId: "2", parentId: "0", updatedAt: 0 },
        { id: "2", text: "target", prevId: "1", nextId: "3", parentId: "0", updatedAt: 0 },
        { id: "3", text: "next", prevId: "2", nextId: "", parentId: "0", updatedAt: 0 },
      ]);

      await dedent(ctx, (await collections.listItems.findOne("2").exec())!);

      test.expect((await collections.listItems.find().exec()).map((x) => x.toJSON())).toEqual([
        { id: "1", text: "prev", prevId: "", nextId: "2", parentId: "0", updatedAt: 0 },
        { id: "2", text: "target", prevId: "1", nextId: "3", parentId: "0", updatedAt: 0 },
        { id: "3", text: "next", prevId: "2", nextId: "", parentId: "0", updatedAt: 0 },
      ]);
    });

    test("dedent with parent item without next item", async (test) => {
      const tid = test.meta.id;
      let collections = await createCollections(tid);
      let now = Date.now();
      let ctx = createActionContext(collections, now);

      await collections.listItems.bulkUpsert([
        { id: "1", text: "parent", prevId: "", nextId: "", parentId: "0", updatedAt: 0 },
        { id: "2", text: "prev", prevId: "", nextId: "3", parentId: "1", updatedAt: 0 },
        { id: "3", text: "target", prevId: "2", nextId: "4", parentId: "1", updatedAt: 0 },
        { id: "4", text: "next", prevId: "3", nextId: "", parentId: "1", updatedAt: 0 },
      ]);

      await dedent(ctx, (await collections.listItems.findOne("3").exec())!);

      test.expect((await collections.listItems.find().exec()).map((x) => x.toJSON())).toEqual([
        { id: "1", text: "parent", prevId: "", nextId: "3", parentId: "0", updatedAt: now },
        { id: "2", text: "prev", prevId: "", nextId: "4", parentId: "1", updatedAt: now },
        { id: "3", text: "target", prevId: "1", nextId: "", parentId: "0", updatedAt: now },
        { id: "4", text: "next", prevId: "2", nextId: "", parentId: "1", updatedAt: now },
      ]);
    });

    test("dedent with parent item with next item", async (test) => {
      const tid = test.meta.id;
      let collections = await createCollections(tid);
      let now = Date.now();
      let ctx = createActionContext(collections, now);

      await collections.listItems.bulkUpsert([
        { id: "1", text: "parent", prevId: "", nextId: "5", parentId: "0", updatedAt: 0 },
        { id: "2", text: "prev", prevId: "", nextId: "3", parentId: "1", updatedAt: 0 },
        { id: "3", text: "target", prevId: "2", nextId: "4", parentId: "1", updatedAt: 0 },
        { id: "4", text: "next", prevId: "3", nextId: "", parentId: "1", updatedAt: 0 },
        { id: "5", text: "next of parent", prevId: "1", nextId: "", parentId: "0", updatedAt: 0 },
      ]);

      await dedent(ctx, (await collections.listItems.findOne("3").exec())!);

      test.expect((await collections.listItems.find().exec()).map((x) => x.toJSON())).toEqual([
        { id: "1", text: "parent", prevId: "", nextId: "3", parentId: "0", updatedAt: now },
        { id: "2", text: "prev", prevId: "", nextId: "4", parentId: "1", updatedAt: now },
        { id: "3", text: "target", prevId: "1", nextId: "5", parentId: "0", updatedAt: now },
        { id: "4", text: "next", prevId: "2", nextId: "", parentId: "1", updatedAt: now },
        { id: "5", text: "next of parent", prevId: "3", nextId: "", parentId: "0", updatedAt: now },
      ]);
    });
  });
}

export function remove(ctx: ActionContext, item: RxDocument<ListItem>) {
  return Promise.all([unlinkFromSiblings(ctx, item), item.remove()]);
}

if (import.meta.vitest) {
  describe("remove", () => {
    test("remove item without siblings", async (test) => {
      const tid = test.meta.id;
      let collections = await createCollections(tid);
      let ctx = createActionContext(collections, Date.now());

      await collections.listItems.bulkUpsert([
        { id: "1", text: "target", prevId: "", nextId: "", parentId: "0", updatedAt: 0 },
      ]);

      await remove(ctx, (await collections.listItems.findOne("1").exec())!);

      test.expect(await collections.listItems.find().exec()).toEqual([]);
    });

    test("remove item with prev item without next item", async (test) => {
      const tid = test.meta.id;
      let collections = await createCollections(tid);
      let now = Date.now();
      let ctx = createActionContext(collections, now);

      await collections.listItems.bulkUpsert([
        { id: "1", text: "prev", prevId: "", nextId: "2", parentId: "0", updatedAt: 0 },
        { id: "2", text: "target", prevId: "1", nextId: "", parentId: "0", updatedAt: 0 },
      ]);

      await remove(ctx, (await collections.listItems.findOne("2").exec())!);

      test
        .expect((await collections.listItems.find().exec()).map((x) => x.toJSON()))
        .toEqual([{ id: "1", text: "prev", prevId: "", nextId: "", parentId: "0", updatedAt: now }]);
    });

    test("remove item with next item without prev item", async (test) => {
      const tid = test.meta.id;
      let collections = await createCollections(tid);
      let now = Date.now();
      let ctx = createActionContext(collections, now);

      await collections.listItems.bulkUpsert([
        { id: "1", text: "target", prevId: "", nextId: "2", parentId: "0", updatedAt: 0 },
        { id: "2", text: "next", prevId: "1", nextId: "", parentId: "0", updatedAt: 0 },
      ]);

      await remove(ctx, (await collections.listItems.findOne("1").exec())!);

      test
        .expect((await collections.listItems.find().exec()).map((x) => x.toJSON()))
        .toEqual([{ id: "2", text: "next", prevId: "", nextId: "", parentId: "0", updatedAt: now }]);
    });

    test("remove item with siblings", async (test) => {
      const tid = test.meta.id;
      let collections = await createCollections(tid);
      let now = Date.now();
      let ctx = createActionContext(collections, now);

      await collections.listItems.bulkUpsert([
        { id: "1", text: "prev", prevId: "", nextId: "2", parentId: "0", updatedAt: 0 },
        { id: "2", text: "target", prevId: "1", nextId: "3", parentId: "0", updatedAt: 0 },
        { id: "3", text: "next", prevId: "2", nextId: "", parentId: "0", updatedAt: 0 },
      ]);

      await remove(ctx, (await collections.listItems.findOne("2").exec())!);

      test.expect((await collections.listItems.find().exec()).map((x) => x.toJSON())).toEqual([
        { id: "1", text: "prev", prevId: "", nextId: "3", parentId: "0", updatedAt: now },
        { id: "3", text: "next", prevId: "1", nextId: "", parentId: "0", updatedAt: now },
      ]);
    });
  });
}
