import type { RxDBService } from "@/services/rxdb";
import type { CollectionNameToDocumentType } from "@/services/rxdb/collections";
import type { RxDocument } from "rxdb";

import { ErrorWithFields } from "@/error";
import { makeListItems } from "@/services/rxdb/collections/test";
import { InconsistentError } from "@/services/rxdb/error";
import { createRxDBServiceForTest } from "@/services/rxdb/test";

export type ListItem = CollectionNameToDocumentType["listItems"];
export type ListItemDocument = RxDocument<ListItem>;

async function getPrevItem(service: RxDBService, baseItem: RxDocument<ListItem>) {
  let prevItem: ListItemDocument | undefined;

  if (baseItem.prevId !== "") {
    prevItem = (await service.collections.listItems.findOne(baseItem.prevId).exec()) ?? undefined;

    if (!prevItem) {
      throw new InconsistentError("baseItem.prevId is invalid", {
        baseItem: baseItem.toJSON(),
      });
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
      throw new InconsistentError("baseItem.nextId is invalid", {
        baseItem: baseItem.toJSON(),
      });
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

function isRxDocument<T>(
  document: Omit<T, "parentId" | "prevId" | "nextId" | "updatedAt"> | RxDocument<T>
): document is RxDocument<T> {
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
      const service = await createRxDBServiceForTest(test.task.id);

      await service.collections.listItems.bulkInsert(makeListItems("", 0, [["base"]]));
      const baseItem = (await service.collections.listItems.findOne("base").exec())!;

      test.expect(await getAboveItem(service, baseItem)).toBeUndefined();
    });

    test("no prev and has parent", async (test) => {
      const service = await createRxDBServiceForTest(test.task.id);

      await service.collections.listItems.bulkInsert(
        // prettier-ignore
        makeListItems("", 0, [
          ["parent", [
            ["base"]
          ]],
        ])
      );
      const baseItem = (await service.collections.listItems.findOne("base").exec())!;

      test.expect((await getAboveItem(service, baseItem))?.id).toBe("parent");
    });

    test("has prev and no children of prev", async (test) => {
      const service = await createRxDBServiceForTest(test.task.id);

      await service.collections.listItems.bulkInsert(
        // prettier-ignore
        makeListItems("", 0, [
          ["prev"],
          ["base"]
        ])
      );
      const baseItem = (await service.collections.listItems.findOne("base").exec())!;

      test.expect((await getAboveItem(service, baseItem))?.id).toBe("prev");
    });

    test("has prev and has children of prev and no children of children of prev", async (test) => {
      const service = await createRxDBServiceForTest(test.task.id);

      await service.collections.listItems.bulkInsert(
        // prettier-ignore
        makeListItems("", 0, [
          ["prev", [
            ["child1 of prev"],
            ["child2 of prev"]
          ]],
          ["base"],
        ])
      );
      const baseItem = (await service.collections.listItems.findOne("base").exec())!;

      test.expect((await getAboveItem(service, baseItem))?.id).toBe("child2 of prev");
    });

    test("has prev and has children of prev and has children of children of prev", async (test) => {
      const service = await createRxDBServiceForTest(test.task.id);

      await service.collections.listItems.bulkInsert(
        // prettier-ignore
        makeListItems("", 0, [
          ["prev", [
            ["child1 of prev"],
            ["child2 of prev", [
              ["child1 of child2 of prev"],
              ["child2 of child2 of prev"],
            ]],
          ]],
          ["base"],
        ])
      );
      const baseItem = (await service.collections.listItems.findOne("base").exec())!;

      test.expect((await getAboveItem(service, baseItem))?.id).toBe("child2 of child2 of prev");
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
      const service = await createRxDBServiceForTest(test.task.id);

      await service.collections.listItems.bulkInsert(
        // prettier-ignore
        makeListItems("", 0, [
          ["parent of parent", [
            ["parent", [
              ["base", [
                ["child1"],
                ["child2"],
              ]],
              ["next"],
            ]],
            ["next of parent"],
          ]],
          ["next of parent of parent"],
        ])
      );
      const baseItem = (await service.collections.listItems.findOne("base").exec())!;

      test.expect((await getBelowItem(service, baseItem))?.id).toBe("child1");
    });

    test("no children and has next", async (test) => {
      const service = await createRxDBServiceForTest(test.task.id);

      await service.collections.listItems.bulkInsert(
        // prettier-ignore
        makeListItems("", 0, [
          ["parent of parent", [
            ["parent", [
              ["base"],
              ["next"],
            ]],
            ["next of parent"],
          ]],
          ["next of parent of parent"],
        ])
      );
      const baseItem = (await service.collections.listItems.findOne("base").exec())!;

      test.expect((await getBelowItem(service, baseItem))?.id).toBe("next");
    });

    test("no children and no next and has next of parent", async (test) => {
      const service = await createRxDBServiceForTest(test.task.id);

      await service.collections.listItems.bulkInsert(
        // prettier-ignore
        makeListItems("", 0, [
          ["parent of parent", [
            ["parent", [
              ["base"],
            ]],
            ["next of parent"],
          ]],
          ["next of parent of parent"],
        ])
      );
      const baseItem = (await service.collections.listItems.findOne("base").exec())!;

      test.expect((await getBelowItem(service, baseItem))?.id).toBe("next of parent");
    });

    test("no children and no next and no next of parent and has next of parent of parent", async (test) => {
      const service = await createRxDBServiceForTest(test.task.id);

      await service.collections.listItems.bulkInsert(
        // prettier-ignore
        makeListItems("", 0, [
          ["parent of parent", [
            ["parent", [
              ["base"],
            ]],
          ]],
          ["next of parent of parent"],
        ])
      );
      const baseItem = (await service.collections.listItems.findOne("base").exec())!;

      test.expect((await getBelowItem(service, baseItem))?.id).toBe("next of parent of parent");
    });

    test("no children and no next and no next of parent and no next of parent of parent", async (test) => {
      const service = await createRxDBServiceForTest(test.task.id);

      await service.collections.listItems.bulkUpsert(
        // prettier-ignore
        makeListItems("", 0, [
          ["parent of parent", [
            ["parent", [
              ["base"],
            ]],
          ]],
        ])
      );
      const baseItem = (await service.collections.listItems.findOne("base").exec())!;

      test.expect(await getBelowItem(service, baseItem)).toBeUndefined();
    });
  });
}

export async function getBottomItem(service: RxDBService, parentId: string) {
  let lastItem = await service.collections.listItems.findOne({ selector: { parentId, nextId: "" } }).exec();
  if (!lastItem) return null;

  for (;;) {
    const nextLastItem: ListItemDocument | null = await service.collections.listItems
      .findOne({ selector: { parentId: lastItem.id, nextId: "" } })
      .exec();
    if (!nextLastItem) return lastItem;

    lastItem = nextLastItem;
  }
}

if (import.meta.vitest) {
  describe.skip("getBottomItem", () => {
    // TODO
  });
}

export async function addPrevSibling(
  service: RxDBService,
  updatedAt: number,
  baseItem: RxDocument<ListItem>,
  newItem: Omit<ListItem, "parentId" | "prevId" | "nextId" | "updatedAt"> | RxDocument<ListItem>
) {
  if (newItem.id === "") {
    throw new ErrorWithFields("newItem.id is empty", { newItem });
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
      const service = await createRxDBServiceForTest(test.task.id);
      const now = Date.now();

      await service.collections.listItems.bulkInsert(makeListItems("", 0, [["base"]]));

      await addPrevSibling(service, now, (await service.collections.listItems.findOne("base").exec())!, {
        id: "new",
        text: "new",
      });

      test.expect((await service.collections.listItems.find().exec()).map((x) => x.toJSON())).toEqual(
        // prettier-ignore
        makeListItems("", now, [
          ["new"],
          ["base"],
        ])
      );
    });

    test("insert", async (test) => {
      const service = await createRxDBServiceForTest(test.task.id);
      const now = Date.now();

      await service.collections.listItems.bulkInsert(
        // prettier-ignore
        makeListItems("", 0, [
          ["prev"],
          ["base"],
        ])
      );

      await addPrevSibling(service, now, (await service.collections.listItems.findOne("base").exec())!, {
        id: "new",
        text: "new",
      });

      test.expect((await service.collections.listItems.find().exec()).map((x) => x.toJSON())).toEqual(
        // prettier-ignore
        makeListItems("", now, [
          ["prev"],
          ["new"],
          ["base"],
        ])
      );
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
    throw new ErrorWithFields("newItem.id is empty", { newItem });
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
      const service = await createRxDBServiceForTest(test.task.id);
      const now = Date.now();

      await service.collections.listItems.bulkInsert(makeListItems("", 0, [["base"]]));

      await addNextSibling(service, now, (await service.collections.listItems.findOne("base").exec())!, {
        id: "new",
        text: "new",
      });

      test.expect((await service.collections.listItems.find().exec()).map((x) => x.toJSON())).toEqual(
        // prettier-ignore
        makeListItems("", now, [
          ["base"],
          ["new"],
        ])
      );
    });

    test("insert", async (test) => {
      const service = await createRxDBServiceForTest(test.task.id);
      const now = Date.now();

      await service.collections.listItems.bulkInsert(
        // prettier-ignore
        makeListItems("", 0, [
          ["base"],
          ["next"],
        ])
      );

      await addNextSibling(service, now, (await service.collections.listItems.findOne("base").exec())!, {
        id: "new",
        text: "new",
      });

      test.expect((await service.collections.listItems.find().exec()).map((x) => x.toJSON())).toEqual(
        // prettier-ignore
        makeListItems("", now, [
          ["base"],
          ["new"],
          ["next"],
        ])
      );
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
      const service = await createRxDBServiceForTest(test.task.id);

      await service.collections.listItems.bulkInsert(
        // prettier-ignore
        makeListItems("", 0, [
          ["target"],
          ["next"],
        ])
      );

      await indent(service, Date.now(), (await service.collections.listItems.findOne("target").exec())!);

      test.expect((await service.collections.listItems.find().exec()).map((x) => x.toJSON())).toEqual(
        // prettier-ignore
        makeListItems("", 0, [
          ["target"],
          ["next"],
        ])
      );
    });

    test("indent with prev item without children", async (test) => {
      const service = await createRxDBServiceForTest(test.task.id);
      const now = Date.now();

      await service.collections.listItems.bulkInsert(
        // prettier-ignore
        makeListItems("", 0, [
          ["prev"],
          ["target"],
          ["next"],
        ])
      );

      await indent(service, now, (await service.collections.listItems.findOne("target").exec())!);

      test.expect((await service.collections.listItems.find().exec()).map((x) => x.toJSON())).toEqual(
        // prettier-ignore
        makeListItems("", now, [
          ["prev", [
            ["target"],
          ]],
          ["next"],
        ])
      );
    });

    test("indent with prev item with children", async (test) => {
      const service = await createRxDBServiceForTest(test.task.id);
      const now = Date.now();

      await service.collections.listItems.bulkInsert(
        // prettier-ignore
        makeListItems("", 0, [
          ["prev", [
            ["child of prev"],
          ]],
          ["target"],
          ["next"],
        ])
      );

      await indent(service, now, (await service.collections.listItems.findOne("target").exec())!);

      test.expect((await service.collections.listItems.find().exec()).map((x) => x.toJSON())).toEqual(
        // prettier-ignore
        makeListItems("", now, [
          ["prev", [
            ["child of prev"],
            ["target"],
          ]],
          ["next"],
        ])
      );
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
      const service = await createRxDBServiceForTest(test.task.id);

      await service.collections.listItems.bulkInsert(
        // prettier-ignore
        makeListItems("", 0, [
          ["prev"],
          ["target"],
          ["next"],
        ])
      );

      await dedent(service, Date.now(), (await service.collections.listItems.findOne("target").exec())!);

      test.expect((await service.collections.listItems.find().exec()).map((x) => x.toJSON())).toEqual(
        // prettier-ignore
        makeListItems("", 0, [
          ["prev"],
          ["target"],
          ["next"],
        ])
      );
    });

    test("dedent with parent item without next item", async (test) => {
      const service = await createRxDBServiceForTest(test.task.id);
      const now = Date.now();

      await service.collections.listItems.bulkInsert(
        // prettier-ignore
        makeListItems("", 0, [
          ["parent", [
            ["prev"],
            ["target"],
            ["next"],
          ]],
        ])
      );

      await dedent(service, now, (await service.collections.listItems.findOne("target").exec())!);

      test.expect((await service.collections.listItems.find().exec()).map((x) => x.toJSON())).toEqual(
        // prettier-ignore
        makeListItems("", now, [
          ["parent", [
            ["prev"],
            ["next"],
          ]],
          ["target"],
        ])
      );
    });

    test("dedent with parent item with next item", async (test) => {
      const service = await createRxDBServiceForTest(test.task.id);
      const now = Date.now();

      await service.collections.listItems.bulkInsert(
        // prettier-ignore
        makeListItems("", 0, [
          ["parent", [
            ["prev"],
            ["target"],
            ["next"],
          ]],
          ["next of parent"],
        ])
      );

      await dedent(service, now, (await service.collections.listItems.findOne("target").exec())!);

      test.expect((await service.collections.listItems.find().exec()).map((x) => x.toJSON())).toEqual(
        // prettier-ignore
        makeListItems("", now, [
          ["parent", [
            ["prev"],
            ["next"],
          ]],
          ["target"],
          ["next of parent"],
        ])
      );
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
      const service = await createRxDBServiceForTest(test.task.id);

      await service.collections.listItems.bulkInsert(makeListItems("", 0, [["target"]]));

      await remove(service, Date.now(), (await service.collections.listItems.findOne("target").exec())!);

      test.expect(await service.collections.listItems.find().exec()).toEqual([]);
    });

    test("remove item with prev item without next item", async (test) => {
      const service = await createRxDBServiceForTest(test.task.id);
      const now = Date.now();

      await service.collections.listItems.bulkInsert(
        // prettier-ignore
        makeListItems("", 0, [
          ["prev"],
          ["target"],
        ])
      );

      await remove(service, now, (await service.collections.listItems.findOne("target").exec())!);

      test.expect((await service.collections.listItems.find().exec()).map((x) => x.toJSON())).toEqual(
        // prettier-ignore
        makeListItems("", now, [
          ["prev"],
        ])
      );
    });

    test("remove item with next item without prev item", async (test) => {
      const service = await createRxDBServiceForTest(test.task.id);
      const now = Date.now();

      await service.collections.listItems.bulkInsert(
        // prettier-ignore
        makeListItems("", 0, [
          ["target"],
          ["next"],
        ])
      );

      await remove(service, now, (await service.collections.listItems.findOne("target").exec())!);

      test.expect((await service.collections.listItems.find().exec()).map((x) => x.toJSON())).toEqual(
        // prettier-ignore
        makeListItems("", now, [
          ["next"],
        ])
      );
    });

    test("remove item with siblings", async (test) => {
      const service = await createRxDBServiceForTest(test.task.id);
      const now = Date.now();

      await service.collections.listItems.bulkInsert(
        // prettier-ignore
        makeListItems("", 0, [
          ["prev"],
          ["target"],
          ["next"],
        ])
      );

      await remove(service, now, (await service.collections.listItems.findOne("target").exec())!);

      test.expect((await service.collections.listItems.find().exec()).map((x) => x.toJSON())).toEqual(
        // prettier-ignore
        makeListItems("", now, [
          ["prev"],
          ["next"],
        ])
      );
    });
  });
}
