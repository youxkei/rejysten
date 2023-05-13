import type { RxDBService } from "@/services/rxdb";
import type { CollectionNameToDocumentType } from "@/services/rxdb/collections";
import type { RxDocument } from "rxdb";

import { InconsistentError } from "@/services/rxdb/error";
import { createRxDBServiceForTest } from "@/services/rxdb/test";

export type ListItem = CollectionNameToDocumentType["listItems"];
export type ListItemDocument = RxDocument<ListItem>;

async function getPrevItem(service: RxDBService, baseItem: RxDocument<ListItem>) {
  let prevItem: ListItemDocument | undefined;

  if (baseItem.prevId !== "") {
    prevItem = (await service.collections.listItems.findOne(baseItem.prevId).exec()) ?? undefined;

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

async function getNextItem(service: RxDBService, baseItem: RxDocument<ListItem>) {
  let nextItem: ListItemDocument | undefined;

  if (baseItem.nextId !== "") {
    nextItem = (await service.collections.listItems.findOne(baseItem.nextId).exec()) ?? undefined;

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

async function getParentItem(service: RxDBService, baseItem: RxDocument<ListItem>) {
  let parentItem: RxDocument<ListItem> | undefined;

  if (baseItem.parentId !== "") {
    parentItem = (await service.collections.listItems.findOne(baseItem.parentId).exec()) ?? undefined;

    if (!parentItem) {
      // this is normal situation because parentId may refer to an item of another collection
      return;
    }
  }

  return parentItem;
}

async function getFirstChildItem(service: RxDBService, baseItem: RxDocument<ListItem>) {
  const firstChildItems = await service.collections.listItems
    .find({
      selector: {
        parentId: baseItem.id,
        prevId: "",
      },
    })
    .exec();

  if (firstChildItems.length > 1) {
    throw new InconsistentError("there are many first child items", {
      baseItem: baseItem.toJSON(),
      firstChildItems: firstChildItems.map((item) => item.toJSON()),
    });
  }

  if (firstChildItems.length === 0) {
    return;
  }

  return firstChildItems[0];
}

async function getLastChildItem(service: RxDBService, baseItem: RxDocument<ListItem>) {
  const lastChildItems = await service.collections.listItems
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

async function unlinkFromSiblings(service: RxDBService, updatedAt: number, item: RxDocument<ListItem>) {
  const [prevItem, nextItem] = await Promise.all([getPrevItem(service, item), getNextItem(service, item)]);

  if (prevItem) {
    await prevItem.patch({
      nextId: nextItem?.id ?? "",
      updatedAt,
    });
  }

  if (nextItem) {
    await nextItem.patch({
      prevId: prevItem?.id ?? "",
      updatedAt,
    });
  }
}

function isRxDocument<T>(document: Omit<T, "parentId" | "prevId" | "nextId" | "updatedAt"> | RxDocument<T>): document is RxDocument<T> {
  return "isInstanceOfRxDocument" in document;
}

export async function getAboveItem(service: RxDBService, baseItem: RxDocument<ListItem>) {
  const prevItem = await getPrevItem(service, baseItem);
  if (prevItem) {
    let currentItem = prevItem;

    for (;;) {
      const lastChildItem = await getLastChildItem(service, currentItem);
      if (!lastChildItem) return currentItem;

      currentItem = lastChildItem;
    }
  }

  return getParentItem(service, baseItem);
}

if (import.meta.vitest) {
  describe("getAboveItem", () => {
    test("no prev and no parent", async (test) => {
      const service = await createRxDBServiceForTest(test.meta.id);

      await service.collections.listItems.bulkUpsert([{ id: "base", text: "", prevId: "", nextId: "", parentId: "0", updatedAt: 0 }]);
      const baseItem = (await service.collections.listItems.findOne("base").exec())!;

      test.expect(await getAboveItem(service, baseItem)).toBeUndefined();
    });

    test("no prev and has parent", async (test) => {
      const service = await createRxDBServiceForTest(test.meta.id);

      await service.collections.listItems.bulkUpsert([
        { id: "parent", text: "", prevId: "", nextId: "", parentId: "", updatedAt: 0 },
        /**/ { id: "base", text: "", prevId: "", nextId: "", parentId: "parent", updatedAt: 0 },
      ]);
      const baseItem = (await service.collections.listItems.findOne("base").exec())!;

      test.expect((await getAboveItem(service, baseItem))?.toJSON()).toEqual({
        id: "parent",
        text: "",
        prevId: "",
        nextId: "",
        parentId: "",
        updatedAt: 0,
      });
    });

    test("has prev and no children of prev", async (test) => {
      const service = await createRxDBServiceForTest(test.meta.id);

      await service.collections.listItems.bulkUpsert([
        { id: "prev", text: "", prevId: "", nextId: "base", parentId: "", updatedAt: 0 },
        { id: "base", text: "", prevId: "prev", nextId: "", parentId: "", updatedAt: 0 },
      ]);
      const baseItem = (await service.collections.listItems.findOne("base").exec())!;

      test.expect((await getAboveItem(service, baseItem))?.toJSON()).toEqual({
        id: "prev",
        text: "",
        prevId: "",
        nextId: "base",
        parentId: "",
        updatedAt: 0,
      });
    });

    test("has prev and has children of prev and no children of children of prev", async (test) => {
      const service = await createRxDBServiceForTest(test.meta.id);

      await service.collections.listItems.bulkUpsert([
        { id: "prev", text: "", prevId: "", nextId: "base", parentId: "", updatedAt: 0 },
        /**/ { id: "child1 of prev", text: "", prevId: "", nextId: "child2 of prev", parentId: "prev", updatedAt: 0 },
        /**/ { id: "child2 of prev", text: "", prevId: "child1 of prev", nextId: "", parentId: "prev", updatedAt: 0 },
        { id: "base", text: "", prevId: "prev", nextId: "", parentId: "", updatedAt: 0 },
      ]);
      const baseItem = (await service.collections.listItems.findOne("base").exec())!;

      test.expect((await getAboveItem(service, baseItem))?.toJSON()).toEqual({
        id: "child2 of prev",
        text: "",
        prevId: "child1 of prev",
        nextId: "",
        parentId: "prev",
        updatedAt: 0,
      });
    });

    test("has prev and has children of prev and has children of children of prev", async (test) => {
      const service = await createRxDBServiceForTest(test.meta.id);

      await service.collections.listItems.bulkUpsert([
        { id: "prev", text: "", prevId: "", nextId: "base", parentId: "", updatedAt: 0 },
        /**/ { id: "child1 of prev", text: "", prevId: "", nextId: "child2 of prev", parentId: "prev", updatedAt: 0 },
        /**/ { id: "child2 of prev", text: "", prevId: "child1 of prev", nextId: "", parentId: "prev", updatedAt: 0 },
        /*     */ { id: "child1 of child2 of prev", text: "", prevId: "", nextId: "child2 of child2 of prev", parentId: "child2 of prev", updatedAt: 0 },
        /*     */ { id: "child2 of child2 of prev", text: "", prevId: "child1 of child2 of prev", nextId: "", parentId: "child2 of prev", updatedAt: 0 },
        { id: "base", text: "", prevId: "prev", nextId: "", parentId: "", updatedAt: 0 },
      ]);
      const baseItem = (await service.collections.listItems.findOne("base").exec())!;

      test.expect((await getAboveItem(service, baseItem))?.toJSON()).toEqual({
        id: "child2 of child2 of prev",
        text: "",
        prevId: "child1 of child2 of prev",
        nextId: "",
        parentId: "child2 of prev",
        updatedAt: 0,
      });
    });
  });
}

export async function getBelowItem(service: RxDBService, baseItem: RxDocument<ListItem>) {
  // TODO
  const firstChildItem = await getFirstChildItem(service, baseItem);
  if (firstChildItem) return firstChildItem;

  let currentItem: ListItemDocument | undefined = baseItem;
  while (currentItem) {
    const nextItem = await getNextItem(service, currentItem);
    if (nextItem) return nextItem;

    currentItem = await getParentItem(service, currentItem);
  }
}

if (import.meta.vitest) {
  describe("getBelowItem", () => {
    test("has children", async (test) => {
      const service = await createRxDBServiceForTest(test.meta.id);

      await service.collections.listItems.bulkUpsert([
        { id: "parent of parent", text: "", prevId: "", nextId: "next of parent of parent", parentId: "", updatedAt: 0 },
        /**/ { id: "parent", text: "", prevId: "", nextId: "next of parent", parentId: "parent of parent", updatedAt: 0 },
        /*     */ { id: "base", text: "", prevId: "", nextId: "next", parentId: "parent", updatedAt: 0 },
        /*          */ { id: "child1", text: "", prevId: "", nextId: "child2", parentId: "base", updatedAt: 0 },
        /*          */ { id: "child2", text: "", prevId: "child1", nextId: "", parentId: "base", updatedAt: 0 },
        /*     */ { id: "next", text: "", prevId: "base", nextId: "", parentId: "parent", updatedAt: 0 },
        /**/ { id: "next of parent", text: "", prevId: "parent", nextId: "", parentId: "parent of parent", updatedAt: 0 },
        { id: "next of parent of parent", text: "", prevId: "parent of parent", nextId: "", parentId: "", updatedAt: 0 },
      ]);
      const baseItem = (await service.collections.listItems.findOne("base").exec())!;

      test.expect((await getBelowItem(service, baseItem))?.toJSON()).toEqual({
        id: "child1",
        text: "",
        prevId: "",
        nextId: "child2",
        parentId: "base",
        updatedAt: 0,
      });
    });

    test("no children and has next", async (test) => {
      const service = await createRxDBServiceForTest(test.meta.id);

      await service.collections.listItems.bulkUpsert([
        { id: "parent of parent", text: "", prevId: "", nextId: "next of parent of parent", parentId: "", updatedAt: 0 },
        /**/ { id: "parent", text: "", prevId: "", nextId: "next of parent", parentId: "parent of parent", updatedAt: 0 },
        /*     */ { id: "base", text: "", prevId: "", nextId: "next", parentId: "parent", updatedAt: 0 },
        /*     */ { id: "next", text: "", prevId: "base", nextId: "", parentId: "parent", updatedAt: 0 },
        /**/ { id: "next of parent", text: "", prevId: "parent", nextId: "", parentId: "parent of parent", updatedAt: 0 },
        { id: "next of parent of parent", text: "", prevId: "parent of parent", nextId: "", parentId: "", updatedAt: 0 },
      ]);
      const baseItem = (await service.collections.listItems.findOne("base").exec())!;

      test.expect((await getBelowItem(service, baseItem))?.toJSON()).toEqual({
        id: "next",
        text: "",
        prevId: "base",
        nextId: "",
        parentId: "parent",
        updatedAt: 0,
      });
    });

    test("no children and no next and has next of parent", async (test) => {
      const service = await createRxDBServiceForTest(test.meta.id);

      await service.collections.listItems.bulkUpsert([
        { id: "parent of parent", text: "", prevId: "", nextId: "next of parent of parent", parentId: "", updatedAt: 0 },
        /**/ { id: "parent", text: "", prevId: "", nextId: "next of parent", parentId: "parent of parent", updatedAt: 0 },
        /*     */ { id: "base", text: "", prevId: "", nextId: "", parentId: "parent", updatedAt: 0 },
        /**/ { id: "next of parent", text: "", prevId: "parent", nextId: "", parentId: "parent of parent", updatedAt: 0 },
        { id: "next of parent of parent", text: "", prevId: "parent of parent", nextId: "", parentId: "", updatedAt: 0 },
      ]);
      const baseItem = (await service.collections.listItems.findOne("base").exec())!;

      test.expect((await getBelowItem(service, baseItem))?.toJSON()).toEqual({
        id: "next of parent",
        text: "",
        prevId: "parent",
        nextId: "",
        parentId: "parent of parent",
        updatedAt: 0,
      });
    });

    test("no children and no next and no next of parent and has next of parent of parent", async (test) => {
      const service = await createRxDBServiceForTest(test.meta.id);

      await service.collections.listItems.bulkUpsert([
        { id: "parent of parent", text: "", prevId: "", nextId: "next of parent of parent", parentId: "", updatedAt: 0 },
        /**/ { id: "parent", text: "", prevId: "", nextId: "", parentId: "parent of parent", updatedAt: 0 },
        /*     */ { id: "base", text: "", prevId: "", nextId: "", parentId: "parent", updatedAt: 0 },
        { id: "next of parent of parent", text: "", prevId: "parent of parent", nextId: "", parentId: "", updatedAt: 0 },
      ]);
      const baseItem = (await service.collections.listItems.findOne("base").exec())!;

      test.expect((await getBelowItem(service, baseItem))?.toJSON()).toEqual({
        id: "next of parent of parent",
        text: "",
        prevId: "parent of parent",
        nextId: "",
        parentId: "",
        updatedAt: 0,
      });
    });

    test("no children and no next and no next of parent and no next of parent of parent", async (test) => {
      const service = await createRxDBServiceForTest(test.meta.id);

      await service.collections.listItems.bulkUpsert([
        { id: "parent of parent", text: "", prevId: "", nextId: "", parentId: "", updatedAt: 0 },
        /**/ { id: "parent", text: "", prevId: "", nextId: "", parentId: "parent of parent", updatedAt: 0 },
        /*     */ { id: "base", text: "", prevId: "", nextId: "", parentId: "parent", updatedAt: 0 },
      ]);
      const baseItem = (await service.collections.listItems.findOne("base").exec())!;

      test.expect((await getBelowItem(service, baseItem))?.toJSON()).toBeUndefined();
    });
  });
}

export async function addPrevSibling(
  service: RxDBService,
  updatedAt: number,
  baseItem: RxDocument<ListItem>,
  newItem: Omit<ListItem, "parentId" | "prevId" | "nextId" | "updatedAt"> | RxDocument<ListItem>
) {
  if (newItem.id === "") {
    throw new Error(`newItem.id is empty. newItem: ${newItem}`);
  }

  const listItems = service.collections.listItems;
  const prevItem = await getPrevItem(service, baseItem);

  if (!prevItem) {
    if (isRxDocument(newItem)) {
      await newItem.patch({
        parentId: baseItem.parentId,
        prevId: "",
        nextId: baseItem.id,
        updatedAt,
      });
    } else {
      await listItems.insert({
        ...newItem,
        parentId: baseItem.parentId,
        prevId: "",
        nextId: baseItem.id,
        updatedAt,
      });
    }
    await baseItem.patch({ prevId: newItem.id, updatedAt });

    return;
  }

  if (isRxDocument(newItem)) {
    await newItem.patch({
      parentId: baseItem.parentId,
      prevId: prevItem.id,
      nextId: baseItem.id,
      updatedAt,
    });
  } else {
    await listItems.insert({
      ...newItem,
      parentId: baseItem.parentId,
      prevId: prevItem.id,
      nextId: baseItem.id,
      updatedAt,
    });
  }

  await baseItem.patch({ prevId: newItem.id, updatedAt });
  await prevItem.patch({ nextId: newItem.id, updatedAt });
}

if (import.meta.vitest) {
  describe("addPrevSibling", () => {
    test("prepend", async (test) => {
      const service = await createRxDBServiceForTest(test.meta.id);
      const now = Date.now();

      await service.collections.listItems.bulkUpsert([{ id: "1", text: "base", prevId: "", nextId: "", parentId: "0", updatedAt: 0 }]);

      await addPrevSibling(service, now, (await service.collections.listItems.findOne("1").exec())!, {
        id: "2",
        text: "new",
      });

      test.expect((await service.collections.listItems.find().exec()).map((x) => x.toJSON())).toEqual([
        { id: "1", text: "base", prevId: "2", nextId: "", parentId: "0", updatedAt: now },
        { id: "2", text: "new", prevId: "", nextId: "1", parentId: "0", updatedAt: now },
      ]);
    });

    test("insert", async (test) => {
      const service = await createRxDBServiceForTest(test.meta.id);
      const now = Date.now();

      await service.collections.listItems.bulkUpsert([
        { id: "1", text: "base", prevId: "2", nextId: "", parentId: "0", updatedAt: 0 },
        { id: "2", text: "prev", prevId: "", nextId: "1", parentId: "0", updatedAt: 0 },
      ]);

      await addPrevSibling(service, now, (await service.collections.listItems.findOne("1").exec())!, {
        id: "3",
        text: "new",
      });

      test.expect((await service.collections.listItems.find().exec()).map((x) => x.toJSON())).toEqual([
        { id: "1", text: "base", prevId: "3", nextId: "", parentId: "0", updatedAt: now },
        { id: "2", text: "prev", prevId: "", nextId: "3", parentId: "0", updatedAt: now },
        { id: "3", text: "new", prevId: "2", nextId: "1", parentId: "0", updatedAt: now },
      ]);
    });
  });
}

export async function addNextSibling(
  service: RxDBService,
  updatedAt: number,
  baseItem: RxDocument<ListItem>,
  newItem: Omit<ListItem, "parentId" | "prevId" | "nextId" | "updatedAt"> | RxDocument<ListItem>
) {
  if (newItem.id === "") {
    throw new Error(`newItem.id is empty. newItem: ${newItem}`);
  }

  const listItems = service.collections.listItems;
  const nextItem = await getNextItem(service, baseItem);

  if (!nextItem) {
    if (isRxDocument(newItem)) {
      await newItem.patch({
        parentId: baseItem.parentId,
        prevId: baseItem.id,
        nextId: "",
        updatedAt,
      });
    } else {
      await listItems.insert({
        ...newItem,
        parentId: baseItem.parentId,
        prevId: baseItem.id,
        nextId: "",
        updatedAt,
      });
    }
    await baseItem.patch({ nextId: newItem.id, updatedAt });

    return;
  }

  if (isRxDocument(newItem)) {
    await newItem.patch({
      parentId: baseItem.parentId,
      prevId: baseItem.id,
      nextId: nextItem.id,
      updatedAt,
    });
  } else {
    await listItems.insert({
      ...newItem,
      parentId: baseItem.parentId,
      prevId: baseItem.id,
      nextId: nextItem.id,
      updatedAt,
    });
  }
  await baseItem.patch({ nextId: newItem.id, updatedAt });
  await nextItem.patch({ prevId: newItem.id, updatedAt });
}

if (import.meta.vitest) {
  describe("addNextSibling", () => {
    test("append", async (test) => {
      const service = await createRxDBServiceForTest(test.meta.id);
      const now = Date.now();

      await service.collections.listItems.bulkUpsert([{ id: "1", text: "base", prevId: "", nextId: "", parentId: "0", updatedAt: 0 }]);

      await addNextSibling(service, now, (await service.collections.listItems.findOne("1").exec())!, {
        id: "2",
        text: "new",
      });

      test.expect((await service.collections.listItems.find().exec()).map((x) => x.toJSON())).toEqual([
        { id: "1", text: "base", prevId: "", nextId: "2", parentId: "0", updatedAt: now },
        { id: "2", text: "new", prevId: "1", nextId: "", parentId: "0", updatedAt: now },
      ]);
    });

    test("insert", async (test) => {
      const service = await createRxDBServiceForTest(test.meta.id);
      const now = Date.now();

      await service.collections.listItems.bulkUpsert([
        { id: "1", text: "base", prevId: "", nextId: "2", parentId: "0", updatedAt: 0 },
        { id: "2", text: "next", prevId: "1", nextId: "", parentId: "0", updatedAt: 0 },
      ]);

      await addNextSibling(service, now, (await service.collections.listItems.findOne("1").exec())!, {
        id: "3",
        text: "new",
      });

      test.expect((await service.collections.listItems.find().exec()).map((x) => x.toJSON())).toEqual([
        { id: "1", text: "base", prevId: "", nextId: "3", parentId: "0", updatedAt: now },
        { id: "2", text: "next", prevId: "3", nextId: "", parentId: "0", updatedAt: now },
        { id: "3", text: "new", prevId: "1", nextId: "2", parentId: "0", updatedAt: now },
      ]);
    });
  });
}

export async function indent(service: RxDBService, updatedAt: number, item: RxDocument<ListItem>) {
  const prevItem = await getPrevItem(service, item);
  if (!prevItem) return;

  const lastChildItemOfPrevItem = await getLastChildItem(service, prevItem);

  await unlinkFromSiblings(service, updatedAt, item);
  if (lastChildItemOfPrevItem) {
    await addNextSibling(service, updatedAt, lastChildItemOfPrevItem, item);
  } else {
    await item.patch({
      parentId: prevItem.id,
      prevId: "",
      nextId: "",
      updatedAt,
    });
  }
}

if (import.meta.vitest) {
  describe("indent", () => {
    test("cannot indent due to no prev item", async (test) => {
      const service = await createRxDBServiceForTest(test.meta.id);

      await service.collections.listItems.bulkUpsert([
        { id: "1", text: "target", prevId: "", nextId: "2", parentId: "0", updatedAt: 0 },
        { id: "2", text: "next", prevId: "1", nextId: "", parentId: "0", updatedAt: 0 },
      ]);

      await indent(service, Date.now(), (await service.collections.listItems.findOne("1").exec())!);

      test.expect((await service.collections.listItems.find().exec()).map((x) => x.toJSON())).toEqual([
        { id: "1", text: "target", prevId: "", nextId: "2", parentId: "0", updatedAt: 0 },
        { id: "2", text: "next", prevId: "1", nextId: "", parentId: "0", updatedAt: 0 },
      ]);
    });

    test("indent with prev item without children", async (test) => {
      const service = await createRxDBServiceForTest(test.meta.id);
      const now = Date.now();

      await service.collections.listItems.bulkUpsert([
        { id: "1", text: "prev", prevId: "", nextId: "2", parentId: "0", updatedAt: 0 },
        { id: "2", text: "target", prevId: "1", nextId: "3", parentId: "0", updatedAt: 0 },
        { id: "3", text: "next", prevId: "2", nextId: "", parentId: "0", updatedAt: 0 },
      ]);

      await indent(service, now, (await service.collections.listItems.findOne("2").exec())!);

      test.expect((await service.collections.listItems.find().exec()).map((x) => x.toJSON())).toEqual([
        { id: "1", text: "prev", prevId: "", nextId: "3", parentId: "0", updatedAt: now },
        { id: "2", text: "target", prevId: "", nextId: "", parentId: "1", updatedAt: now },
        { id: "3", text: "next", prevId: "1", nextId: "", parentId: "0", updatedAt: now },
      ]);
    });

    test("indent with prev item with children", async (test) => {
      const service = await createRxDBServiceForTest(test.meta.id);
      const now = Date.now();

      await service.collections.listItems.bulkUpsert([
        { id: "1", text: "prev", prevId: "", nextId: "3", parentId: "0", updatedAt: 0 },
        { id: "2", text: "child of prev", prevId: "", nextId: "", parentId: "1", updatedAt: 0 },
        { id: "3", text: "target", prevId: "1", nextId: "4", parentId: "0", updatedAt: 0 },
        { id: "4", text: "next", prevId: "3", nextId: "", parentId: "0", updatedAt: 0 },
      ]);

      await indent(service, now, (await service.collections.listItems.findOne("3").exec())!);

      test.expect((await service.collections.listItems.find().exec()).map((x) => x.toJSON())).toEqual([
        { id: "1", text: "prev", prevId: "", nextId: "4", parentId: "0", updatedAt: now },
        { id: "2", text: "child of prev", prevId: "", nextId: "3", parentId: "1", updatedAt: now },
        { id: "3", text: "target", prevId: "2", nextId: "", parentId: "1", updatedAt: now },
        { id: "4", text: "next", prevId: "1", nextId: "", parentId: "0", updatedAt: now },
      ]);
    });
  });
}

export async function dedent(service: RxDBService, updatedAt: number, item: RxDocument<ListItem>) {
  const parentItem = await getParentItem(service, item);
  if (!parentItem) return;

  await unlinkFromSiblings(service, updatedAt, item);
  await addNextSibling(service, updatedAt, parentItem, item);
}

if (import.meta.vitest) {
  describe("dedent", () => {
    test("cannot dedent due to no parent item", async (test) => {
      const service = await createRxDBServiceForTest(test.meta.id);

      await service.collections.listItems.bulkUpsert([
        { id: "1", text: "prev", prevId: "", nextId: "2", parentId: "0", updatedAt: 0 },
        { id: "2", text: "target", prevId: "1", nextId: "3", parentId: "0", updatedAt: 0 },
        { id: "3", text: "next", prevId: "2", nextId: "", parentId: "0", updatedAt: 0 },
      ]);

      await dedent(service, Date.now(), (await service.collections.listItems.findOne("2").exec())!);

      test.expect((await service.collections.listItems.find().exec()).map((x) => x.toJSON())).toEqual([
        { id: "1", text: "prev", prevId: "", nextId: "2", parentId: "0", updatedAt: 0 },
        { id: "2", text: "target", prevId: "1", nextId: "3", parentId: "0", updatedAt: 0 },
        { id: "3", text: "next", prevId: "2", nextId: "", parentId: "0", updatedAt: 0 },
      ]);
    });

    test("dedent with parent item without next item", async (test) => {
      const service = await createRxDBServiceForTest(test.meta.id);
      const now = Date.now();

      await service.collections.listItems.bulkUpsert([
        { id: "1", text: "parent", prevId: "", nextId: "", parentId: "0", updatedAt: 0 },
        { id: "2", text: "prev", prevId: "", nextId: "3", parentId: "1", updatedAt: 0 },
        { id: "3", text: "target", prevId: "2", nextId: "4", parentId: "1", updatedAt: 0 },
        { id: "4", text: "next", prevId: "3", nextId: "", parentId: "1", updatedAt: 0 },
      ]);

      await dedent(service, now, (await service.collections.listItems.findOne("3").exec())!);

      test.expect((await service.collections.listItems.find().exec()).map((x) => x.toJSON())).toEqual([
        { id: "1", text: "parent", prevId: "", nextId: "3", parentId: "0", updatedAt: now },
        { id: "2", text: "prev", prevId: "", nextId: "4", parentId: "1", updatedAt: now },
        { id: "3", text: "target", prevId: "1", nextId: "", parentId: "0", updatedAt: now },
        { id: "4", text: "next", prevId: "2", nextId: "", parentId: "1", updatedAt: now },
      ]);
    });

    test("dedent with parent item with next item", async (test) => {
      const service = await createRxDBServiceForTest(test.meta.id);
      const now = Date.now();

      await service.collections.listItems.bulkUpsert([
        { id: "1", text: "parent", prevId: "", nextId: "5", parentId: "0", updatedAt: 0 },
        { id: "2", text: "prev", prevId: "", nextId: "3", parentId: "1", updatedAt: 0 },
        { id: "3", text: "target", prevId: "2", nextId: "4", parentId: "1", updatedAt: 0 },
        { id: "4", text: "next", prevId: "3", nextId: "", parentId: "1", updatedAt: 0 },
        { id: "5", text: "next of parent", prevId: "1", nextId: "", parentId: "0", updatedAt: 0 },
      ]);

      await dedent(service, now, (await service.collections.listItems.findOne("3").exec())!);

      test.expect((await service.collections.listItems.find().exec()).map((x) => x.toJSON())).toEqual([
        { id: "1", text: "parent", prevId: "", nextId: "3", parentId: "0", updatedAt: now },
        { id: "2", text: "prev", prevId: "", nextId: "4", parentId: "1", updatedAt: now },
        { id: "3", text: "target", prevId: "1", nextId: "5", parentId: "0", updatedAt: now },
        { id: "4", text: "next", prevId: "2", nextId: "", parentId: "1", updatedAt: now },
        { id: "5", text: "next of parent", prevId: "3", nextId: "", parentId: "0", updatedAt: now },
      ]);
    });
  });
}

export async function remove(service: RxDBService, updatedAt: number, item: RxDocument<ListItem>) {
  await unlinkFromSiblings(service, updatedAt, item);
  await item.remove();
}

if (import.meta.vitest) {
  describe("remove", () => {
    test("remove item without siblings", async (test) => {
      const service = await createRxDBServiceForTest(test.meta.id);

      await service.collections.listItems.bulkUpsert([{ id: "1", text: "target", prevId: "", nextId: "", parentId: "0", updatedAt: 0 }]);

      await remove(service, Date.now(), (await service.collections.listItems.findOne("1").exec())!);

      test.expect(await service.collections.listItems.find().exec()).toEqual([]);
    });

    test("remove item with prev item without next item", async (test) => {
      const service = await createRxDBServiceForTest(test.meta.id);
      const now = Date.now();

      await service.collections.listItems.bulkUpsert([
        { id: "1", text: "prev", prevId: "", nextId: "2", parentId: "0", updatedAt: 0 },
        { id: "2", text: "target", prevId: "1", nextId: "", parentId: "0", updatedAt: 0 },
      ]);

      await remove(service, now, (await service.collections.listItems.findOne("2").exec())!);

      test
        .expect((await service.collections.listItems.find().exec()).map((x) => x.toJSON()))
        .toEqual([{ id: "1", text: "prev", prevId: "", nextId: "", parentId: "0", updatedAt: now }]);
    });

    test("remove item with next item without prev item", async (test) => {
      const service = await createRxDBServiceForTest(test.meta.id);
      const now = Date.now();

      await service.collections.listItems.bulkUpsert([
        { id: "1", text: "target", prevId: "", nextId: "2", parentId: "0", updatedAt: 0 },
        { id: "2", text: "next", prevId: "1", nextId: "", parentId: "0", updatedAt: 0 },
      ]);

      await remove(service, now, (await service.collections.listItems.findOne("1").exec())!);

      test
        .expect((await service.collections.listItems.find().exec()).map((x) => x.toJSON()))
        .toEqual([{ id: "2", text: "next", prevId: "", nextId: "", parentId: "0", updatedAt: now }]);
    });

    test("remove item with siblings", async (test) => {
      const service = await createRxDBServiceForTest(test.meta.id);
      const now = Date.now();

      await service.collections.listItems.bulkUpsert([
        { id: "1", text: "prev", prevId: "", nextId: "2", parentId: "0", updatedAt: 0 },
        { id: "2", text: "target", prevId: "1", nextId: "3", parentId: "0", updatedAt: 0 },
        { id: "3", text: "next", prevId: "2", nextId: "", parentId: "0", updatedAt: 0 },
      ]);

      await remove(service, now, (await service.collections.listItems.findOne("2").exec())!);

      test.expect((await service.collections.listItems.find().exec()).map((x) => x.toJSON())).toEqual([
        { id: "1", text: "prev", prevId: "", nextId: "3", parentId: "0", updatedAt: now },
        { id: "3", text: "next", prevId: "1", nextId: "", parentId: "0", updatedAt: now },
      ]);
    });
  });
}
