import type { RxDBService } from "@/services/rxdb";
import type { CollectionNameToDocumentType } from "@/services/rxdb/collections";
import type { RxDocument } from "rxdb";

import { InconsistentError } from "@/services/rxdb/error";
import { createCollectionsForTest } from "@/services/rxdb/test";

export type ListItem = CollectionNameToDocumentType["listItems"];
export type ListItemDocument = RxDocument<ListItem>;

async function getPrevItem(service: RxDBService, baseItem: RxDocument<ListItem>) {
  const collections = service.collections$();
  if (!collections) return;

  let prevItem: ListItemDocument | undefined;

  if (baseItem.prevId !== "") {
    prevItem = (await collections.listItems.findOne(baseItem.prevId).exec()) ?? undefined;

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
  const collections = service.collections$();
  if (!collections) return;

  let nextItem: ListItemDocument | undefined;

  if (baseItem.nextId !== "") {
    nextItem = (await collections.listItems.findOne(baseItem.nextId).exec()) ?? undefined;

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
  const collections = service.collections$();
  if (!collections) return;

  let parentItem: RxDocument<ListItem> | undefined;

  if (baseItem.parentId !== "") {
    parentItem = (await collections.listItems.findOne(baseItem.parentId).exec()) ?? undefined;

    if (!parentItem) {
      // this is normal situation because parentId may refer to an item of another collection
      return;
    }
  }

  return parentItem;
}

async function getLastChildItem(service: RxDBService, baseItem: RxDocument<ListItem>) {
  const collections = service.collections$();
  if (!collections) return;

  const lastChildItems = await collections.listItems
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

  return Promise.all([
    ...(prevItem
      ? [
          prevItem.patch({
            nextId: nextItem?.id ?? "",
            updatedAt,
          }),
        ]
      : []),
    ...(nextItem
      ? [
          nextItem.patch({
            prevId: prevItem?.id ?? "",
            updatedAt,
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
  service: RxDBService,
  updatedAt: number,
  baseItem: RxDocument<ListItem>,
  newItem: Omit<ListItem, "parentId" | "prevId" | "nextId" | "updatedAt"> | RxDocument<ListItem>
) {
  if (newItem.id === "") {
    throw new Error(`newItem.id is empty. newItem: ${newItem}`);
  }

  const collections = service.collections$();
  if (!collections) return;

  const listItems = collections.listItems;
  const prevItem = await getPrevItem(service, baseItem);

  if (!prevItem) {
    return Promise.all([
      isRxDocument(newItem)
        ? newItem.patch({
            parentId: baseItem.parentId,
            prevId: "",
            nextId: baseItem.id,
            updatedAt,
          })
        : listItems.insert({
            ...newItem,
            parentId: baseItem.parentId,
            prevId: "",
            nextId: baseItem.id,
            updatedAt,
          }),
      baseItem.patch({ prevId: newItem.id, updatedAt }),
    ]);
  }

  return Promise.all([
    isRxDocument(newItem)
      ? newItem.patch({
          parentId: baseItem.parentId,
          prevId: prevItem.id,
          nextId: baseItem.id,
          updatedAt,
        })
      : listItems.insert({
          ...newItem,
          parentId: baseItem.parentId,
          prevId: prevItem.id,
          nextId: baseItem.id,
          updatedAt,
        }),
    baseItem.patch({ prevId: newItem.id, updatedAt }),
    prevItem.patch({ nextId: newItem.id, updatedAt }),
  ]);
}

if (import.meta.vitest) {
  describe("addPrevSibling", () => {
    test("prepend", async (test) => {
      const tid = test.meta.id;
      const collections = await createCollectionsForTest(tid);
      const listItems = collections.listItems;
      const now = Date.now();
      const service = { database$: () => undefined, collections$: () => collections };

      await collections.listItems.bulkUpsert([
        { id: "1", text: "base", prevId: "", nextId: "", parentId: "0", updatedAt: 0 },
      ]);

      await addPrevSibling(service, now, (await collections.listItems.findOne("1").exec())!, {
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
      const collections = await createCollectionsForTest(tid);
      const listItems = collections.listItems;
      const now = Date.now();
      const service = { database$: () => undefined, collections$: () => collections };

      await collections.listItems.bulkUpsert([
        { id: "1", text: "base", prevId: "2", nextId: "", parentId: "0", updatedAt: 0 },
        { id: "2", text: "prev", prevId: "", nextId: "1", parentId: "0", updatedAt: 0 },
      ]);

      await addPrevSibling(service, now, (await collections.listItems.findOne("1").exec())!, {
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
  service: RxDBService,
  updatedAt: number,
  baseItem: RxDocument<ListItem>,
  newItem: Omit<ListItem, "parentId" | "prevId" | "nextId" | "updatedAt"> | RxDocument<ListItem>
) {
  if (newItem.id === "") {
    throw new Error(`newItem.id is empty. newItem: ${newItem}`);
  }

  const collections = service.collections$();
  if (!collections) return;

  const listItems = collections.listItems;
  const nextItem = await getNextItem(service, baseItem);

  if (!nextItem) {
    return Promise.all([
      isRxDocument(newItem)
        ? newItem.patch({
            parentId: baseItem.parentId,
            prevId: baseItem.id,
            nextId: "",
            updatedAt,
          })
        : listItems.insert({
            ...newItem,
            parentId: baseItem.parentId,
            prevId: baseItem.id,
            nextId: "",
            updatedAt,
          }),
      baseItem.patch({ nextId: newItem.id, updatedAt }),
    ]);
  }

  return Promise.all([
    isRxDocument(newItem)
      ? newItem.patch({
          parentId: baseItem.parentId,
          prevId: baseItem.id,
          nextId: nextItem.id,
          updatedAt,
        })
      : listItems.insert({
          ...newItem,
          parentId: baseItem.parentId,
          prevId: baseItem.id,
          nextId: nextItem.id,
          updatedAt,
        }),
    baseItem.patch({ nextId: newItem.id, updatedAt }),
    nextItem.patch({ prevId: newItem.id, updatedAt }),
  ]);
}

if (import.meta.vitest) {
  describe("addNextSibling", () => {
    test("append", async (test) => {
      const tid = test.meta.id;
      const collections = await createCollectionsForTest(tid);
      const listItems = collections.listItems;
      const now = Date.now();
      const service = { database$: () => undefined, collections$: () => collections };

      await collections.listItems.bulkUpsert([
        { id: "1", text: "base", prevId: "", nextId: "", parentId: "0", updatedAt: 0 },
      ]);

      await addNextSibling(service, now, (await collections.listItems.findOne("1").exec())!, {
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
      const collections = await createCollectionsForTest(tid);
      const listItems = collections.listItems;
      const now = Date.now();
      const service = { database$: () => undefined, collections$: () => collections };

      await collections.listItems.bulkUpsert([
        { id: "1", text: "base", prevId: "", nextId: "2", parentId: "0", updatedAt: 0 },
        { id: "2", text: "next", prevId: "1", nextId: "", parentId: "0", updatedAt: 0 },
      ]);

      await addNextSibling(service, now, (await collections.listItems.findOne("1").exec())!, {
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

export async function indent(service: RxDBService, updatedAt: number, item: RxDocument<ListItem>) {
  const prevItem = await getPrevItem(service, item);
  if (!prevItem) return;

  const lastChildItemOfPrevItem = await getLastChildItem(service, prevItem);

  return Promise.all([
    unlinkFromSiblings(service, updatedAt, item),
    lastChildItemOfPrevItem
      ? addNextSibling(service, updatedAt, lastChildItemOfPrevItem, item)
      : item.patch({
          parentId: prevItem.id,
          prevId: "",
          nextId: "",
          updatedAt,
        }),
  ]);
}

if (import.meta.vitest) {
  describe("indent", () => {
    test("cannot indent due to no prev item", async (test) => {
      const tid = test.meta.id;
      const collections = await createCollectionsForTest(tid);
      const service = { database$: () => undefined, collections$: () => collections };

      await collections.listItems.bulkUpsert([
        { id: "1", text: "target", prevId: "", nextId: "2", parentId: "0", updatedAt: 0 },
        { id: "2", text: "next", prevId: "1", nextId: "", parentId: "0", updatedAt: 0 },
      ]);

      await indent(service, Date.now(), (await collections.listItems.findOne("1").exec())!);

      test.expect((await collections.listItems.find().exec()).map((x) => x.toJSON())).toEqual([
        { id: "1", text: "target", prevId: "", nextId: "2", parentId: "0", updatedAt: 0 },
        { id: "2", text: "next", prevId: "1", nextId: "", parentId: "0", updatedAt: 0 },
      ]);
    });

    test("indent with prev item without children", async (test) => {
      const tid = test.meta.id;
      const collections = await createCollectionsForTest(tid);
      const now = Date.now();
      const service = { database$: () => undefined, collections$: () => collections };

      await collections.listItems.bulkUpsert([
        { id: "1", text: "prev", prevId: "", nextId: "2", parentId: "0", updatedAt: 0 },
        { id: "2", text: "target", prevId: "1", nextId: "3", parentId: "0", updatedAt: 0 },
        { id: "3", text: "next", prevId: "2", nextId: "", parentId: "0", updatedAt: 0 },
      ]);

      await indent(service, now, (await collections.listItems.findOne("2").exec())!);

      test.expect((await collections.listItems.find().exec()).map((x) => x.toJSON())).toEqual([
        { id: "1", text: "prev", prevId: "", nextId: "3", parentId: "0", updatedAt: now },
        { id: "2", text: "target", prevId: "", nextId: "", parentId: "1", updatedAt: now },
        { id: "3", text: "next", prevId: "1", nextId: "", parentId: "0", updatedAt: now },
      ]);
    });

    test("indent with prev item with children", async (test) => {
      const tid = test.meta.id;
      const collections = await createCollectionsForTest(tid);
      const now = Date.now();
      const service = { database$: () => undefined, collections$: () => collections };

      await collections.listItems.bulkUpsert([
        { id: "1", text: "prev", prevId: "", nextId: "3", parentId: "0", updatedAt: 0 },
        { id: "2", text: "child of prev", prevId: "", nextId: "", parentId: "1", updatedAt: 0 },
        { id: "3", text: "target", prevId: "1", nextId: "4", parentId: "0", updatedAt: 0 },
        { id: "4", text: "next", prevId: "3", nextId: "", parentId: "0", updatedAt: 0 },
      ]);

      await indent(service, now, (await collections.listItems.findOne("3").exec())!);

      test.expect((await collections.listItems.find().exec()).map((x) => x.toJSON())).toEqual([
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

  return Promise.all([
    unlinkFromSiblings(service, updatedAt, item),
    addNextSibling(service, updatedAt, parentItem, item),
  ]);
}

if (import.meta.vitest) {
  describe("dedent", () => {
    test("cannot dedent due to no parent item", async (test) => {
      const tid = test.meta.id;
      const collections = await createCollectionsForTest(tid);
      const service = { database$: () => undefined, collections$: () => collections };

      await collections.listItems.bulkUpsert([
        { id: "1", text: "prev", prevId: "", nextId: "2", parentId: "0", updatedAt: 0 },
        { id: "2", text: "target", prevId: "1", nextId: "3", parentId: "0", updatedAt: 0 },
        { id: "3", text: "next", prevId: "2", nextId: "", parentId: "0", updatedAt: 0 },
      ]);

      await dedent(service, Date.now(), (await collections.listItems.findOne("2").exec())!);

      test.expect((await collections.listItems.find().exec()).map((x) => x.toJSON())).toEqual([
        { id: "1", text: "prev", prevId: "", nextId: "2", parentId: "0", updatedAt: 0 },
        { id: "2", text: "target", prevId: "1", nextId: "3", parentId: "0", updatedAt: 0 },
        { id: "3", text: "next", prevId: "2", nextId: "", parentId: "0", updatedAt: 0 },
      ]);
    });

    test("dedent with parent item without next item", async (test) => {
      const tid = test.meta.id;
      const collections = await createCollectionsForTest(tid);
      const now = Date.now();
      const service = { database$: () => undefined, collections$: () => collections };

      await collections.listItems.bulkUpsert([
        { id: "1", text: "parent", prevId: "", nextId: "", parentId: "0", updatedAt: 0 },
        { id: "2", text: "prev", prevId: "", nextId: "3", parentId: "1", updatedAt: 0 },
        { id: "3", text: "target", prevId: "2", nextId: "4", parentId: "1", updatedAt: 0 },
        { id: "4", text: "next", prevId: "3", nextId: "", parentId: "1", updatedAt: 0 },
      ]);

      await dedent(service, now, (await collections.listItems.findOne("3").exec())!);

      test.expect((await collections.listItems.find().exec()).map((x) => x.toJSON())).toEqual([
        { id: "1", text: "parent", prevId: "", nextId: "3", parentId: "0", updatedAt: now },
        { id: "2", text: "prev", prevId: "", nextId: "4", parentId: "1", updatedAt: now },
        { id: "3", text: "target", prevId: "1", nextId: "", parentId: "0", updatedAt: now },
        { id: "4", text: "next", prevId: "2", nextId: "", parentId: "1", updatedAt: now },
      ]);
    });

    test("dedent with parent item with next item", async (test) => {
      const tid = test.meta.id;
      const collections = await createCollectionsForTest(tid);
      const now = Date.now();
      const service = { database$: () => undefined, collections$: () => collections };

      await collections.listItems.bulkUpsert([
        { id: "1", text: "parent", prevId: "", nextId: "5", parentId: "0", updatedAt: 0 },
        { id: "2", text: "prev", prevId: "", nextId: "3", parentId: "1", updatedAt: 0 },
        { id: "3", text: "target", prevId: "2", nextId: "4", parentId: "1", updatedAt: 0 },
        { id: "4", text: "next", prevId: "3", nextId: "", parentId: "1", updatedAt: 0 },
        { id: "5", text: "next of parent", prevId: "1", nextId: "", parentId: "0", updatedAt: 0 },
      ]);

      await dedent(service, now, (await collections.listItems.findOne("3").exec())!);

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

export function remove(service: RxDBService, updatedAt: number, item: RxDocument<ListItem>) {
  return Promise.all([unlinkFromSiblings(service, updatedAt, item), item.remove()]);
}

if (import.meta.vitest) {
  describe("remove", () => {
    test("remove item without siblings", async (test) => {
      const tid = test.meta.id;
      const collections = await createCollectionsForTest(tid);
      const service = { database$: () => undefined, collections$: () => collections };

      await collections.listItems.bulkUpsert([
        { id: "1", text: "target", prevId: "", nextId: "", parentId: "0", updatedAt: 0 },
      ]);

      await remove(service, Date.now(), (await collections.listItems.findOne("1").exec())!);

      test.expect(await collections.listItems.find().exec()).toEqual([]);
    });

    test("remove item with prev item without next item", async (test) => {
      const tid = test.meta.id;
      const collections = await createCollectionsForTest(tid);
      const now = Date.now();
      const service = { database$: () => undefined, collections$: () => collections };

      await collections.listItems.bulkUpsert([
        { id: "1", text: "prev", prevId: "", nextId: "2", parentId: "0", updatedAt: 0 },
        { id: "2", text: "target", prevId: "1", nextId: "", parentId: "0", updatedAt: 0 },
      ]);

      await remove(service, now, (await collections.listItems.findOne("2").exec())!);

      test
        .expect((await collections.listItems.find().exec()).map((x) => x.toJSON()))
        .toEqual([{ id: "1", text: "prev", prevId: "", nextId: "", parentId: "0", updatedAt: now }]);
    });

    test("remove item with next item without prev item", async (test) => {
      const tid = test.meta.id;
      const collections = await createCollectionsForTest(tid);
      const now = Date.now();
      const service = { database$: () => undefined, collections$: () => collections };

      await collections.listItems.bulkUpsert([
        { id: "1", text: "target", prevId: "", nextId: "2", parentId: "0", updatedAt: 0 },
        { id: "2", text: "next", prevId: "1", nextId: "", parentId: "0", updatedAt: 0 },
      ]);

      await remove(service, now, (await collections.listItems.findOne("1").exec())!);

      test
        .expect((await collections.listItems.find().exec()).map((x) => x.toJSON()))
        .toEqual([{ id: "2", text: "next", prevId: "", nextId: "", parentId: "0", updatedAt: now }]);
    });

    test("remove item with siblings", async (test) => {
      const tid = test.meta.id;
      const collections = await createCollectionsForTest(tid);
      const now = Date.now();
      const service = { database$: () => undefined, collections$: () => collections };

      await collections.listItems.bulkUpsert([
        { id: "1", text: "prev", prevId: "", nextId: "2", parentId: "0", updatedAt: 0 },
        { id: "2", text: "target", prevId: "1", nextId: "3", parentId: "0", updatedAt: 0 },
        { id: "3", text: "next", prevId: "2", nextId: "", parentId: "0", updatedAt: 0 },
      ]);

      await remove(service, now, (await collections.listItems.findOne("2").exec())!);

      test.expect((await collections.listItems.find().exec()).map((x) => x.toJSON())).toEqual([
        { id: "1", text: "prev", prevId: "", nextId: "3", parentId: "0", updatedAt: now },
        { id: "3", text: "next", prevId: "1", nextId: "", parentId: "0", updatedAt: now },
      ]);
    });
  });
}
