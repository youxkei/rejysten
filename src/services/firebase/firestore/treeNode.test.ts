import {
  type CollectionReference,
  type Firestore,
  collection,
  writeBatch,
  getDoc as getDocFromFirebase,
  doc,
} from "firebase/firestore";
import { generateKeyBetween } from "fractional-indexing";
import { describe, it, vi, beforeAll } from "vitest";

import { type FirestoreService, type DocumentData } from "@/services/firebase/firestore";
import {
  createTestFirestoreService,
  setDocs,
  timestampForCreatedAt,
  timestampForServerTimestamp,
} from "@/services/firebase/firestore/test";
import {
  type TreeNode,
  getFirstChildNode,
  dedent,
  indent,
  getLastChildNode,
  getAboveNode,
  getBelowNode,
  addPrevSibling,
  addNextSibling,
  movePrev,
  moveNext,
  remove,
  getNextNode,
  getPrevNode,
  getParentNode,
  getBottomNodeExclusive,
  addSingle,
} from "@/services/firebase/firestore/treeNode";
import { getEmulatorPort } from "@/test";

let service: FirestoreService;
let firestore: Firestore;

beforeAll(async () => {
  const emulatorPort = await getEmulatorPort();
  const result = createTestFirestoreService(emulatorPort, "treeNode-test");
  service = result as FirestoreService;
  firestore = result.firestore;
});

async function getDoc<T extends object>(col: CollectionReference<T>, id: string): Promise<DocumentData<T>> {
  const snap = await getDocFromFirebase(doc(col, id));
  const data = snap.data();
  if (!data) throw new Error(`Document ${id} not found`);
  return { ...data, id: snap.id } as DocumentData<T>;
}

async function runTestBatch(fn: (batch: ReturnType<typeof writeBatch>) => Promise<void>) {
  const batch = writeBatch(firestore);
  await fn(batch);
  await batch.commit();
}

type TreeNodeWithText = TreeNode & { text: string };
type TreeNodeFixture = [string, TreeNodeFixture[]?];

function makeTreeNodes(
  parentId: string,
  fixtures: TreeNodeFixture[],
  startOrder: string | null = null,
): TreeNodeWithText[] {
  const nodes: TreeNodeWithText[] = [];
  let prevOrder = startOrder;

  for (const fixture of fixtures) {
    const [nodeAndChildren, nextOrder] = makeTreeNode(parentId, fixture, prevOrder);
    nodes.push(...nodeAndChildren);
    prevOrder = nextOrder;
  }

  return nodes;
}

function makeTreeNode(
  parentId: string,
  [text, children]: TreeNodeFixture,
  prevOrder: string | null,
): [TreeNodeWithText[], string] {
  const order = generateKeyBetween(prevOrder, null);
  const node: TreeNodeWithText = {
    text,
    parentId,
    order,
    createdAt: timestampForCreatedAt,
    updatedAt: timestampForCreatedAt,
  };

  const childrenNodes = makeTreeNodes(text, children ?? []);
  return [[node, ...childrenNodes], order];
}

vi.mock(import("firebase/firestore"), async (importOriginal) => {
  const mod = await importOriginal();

  return {
    ...mod,
    serverTimestamp: () => timestampForServerTimestamp,
  };
});

describe.concurrent("treeNode", () => {
  describe("getPrevNode", () => {
    it("no prev node", async (ctx) => {
      const col = collection(firestore, ctx.task.id) as CollectionReference<TreeNodeWithText>;

      await setDocs(col, makeTreeNodes("", [["base"]]));

      await ctx.expect(getPrevNode(service, col, await getDoc(col, "base"))).resolves.toBeUndefined();
    });

    it("prev node exists", async (ctx) => {
      const col = collection(firestore, ctx.task.id) as CollectionReference<TreeNodeWithText>;

      await setDocs(col, makeTreeNodes("", [["prev"], ["base"]]));

      const baseNode = await getDoc(col, "base");
      const prevNode = await getPrevNode(service, col, baseNode);
      ctx.expect(prevNode?.text).toBe("prev");
    });

    it("no prev node when parentId is empty", async (ctx) => {
      const col = collection(firestore, ctx.task.id) as CollectionReference<TreeNodeWithText>;

      const nodes = makeTreeNodes("", [["base"]]);
      nodes[0].parentId = "";
      await setDocs(col, nodes);

      await ctx.expect(getPrevNode(service, col, await getDoc(col, "base"))).resolves.toBeUndefined();
    });
  });

  describe("getNextNode", () => {
    it("no next node", async (ctx) => {
      const col = collection(firestore, ctx.task.id) as CollectionReference<TreeNodeWithText>;

      await setDocs(col, makeTreeNodes("", [["base"]]));

      await ctx.expect(getNextNode(service, col, await getDoc(col, "base"))).resolves.toBeUndefined();
    });

    it("next node exists", async (ctx) => {
      const col = collection(firestore, ctx.task.id) as CollectionReference<TreeNodeWithText>;

      await setDocs(col, makeTreeNodes("", [["base"], ["next"]]));

      const baseNode = await getDoc(col, "base");
      const nextNode = await getNextNode(service, col, baseNode);
      ctx.expect(nextNode?.text).toBe("next");
    });
  });

  describe("getParentNode", () => {
    it("no parent node", async (ctx) => {
      const col = collection(firestore, ctx.task.id) as CollectionReference<TreeNodeWithText>;

      const nodes = makeTreeNodes("", [["base"]]);
      nodes[0].parentId = "";
      await setDocs(col, nodes);

      await ctx.expect(getParentNode(service, col, await getDoc(col, "base"))).resolves.toBeUndefined();
    });

    it("parent node exists", async (ctx) => {
      const col = collection(firestore, ctx.task.id) as CollectionReference<TreeNodeWithText>;

      await setDocs(col, makeTreeNodes("", [["parent", [["child"]]]]));

      const childNode = await getDoc(col, "child");
      const parentNode = await getParentNode(service, col, childNode);
      ctx.expect(parentNode?.text).toBe("parent");
    });

    it("parentId refers to a node of another collection", async (ctx) => {
      const col = collection(firestore, ctx.task.id) as CollectionReference<TreeNodeWithText>;

      // Create a node with parentId pointing to a non-existent node
      const nodes = makeTreeNodes("", [["child"]]);
      nodes[0].parentId = "nonexistent";
      await setDocs(col, nodes);

      const childNode = await getDoc(col, "child");
      await ctx.expect(getParentNode(service, col, childNode)).resolves.toBeUndefined();
    });
  });

  describe("getFirstChildNode", () => {
    it("no children", async (ctx) => {
      const col = collection(firestore, ctx.task.id) as CollectionReference<TreeNodeWithText>;

      await setDocs(col, makeTreeNodes("", [["base"]]));

      await ctx.expect(getFirstChildNode(service, col, await getDoc(col, "base"))).resolves.toBeUndefined();
    });

    it("first child exists", async (ctx) => {
      const col = collection(firestore, ctx.task.id) as CollectionReference<TreeNodeWithText>;

      await setDocs(col, makeTreeNodes("", [["parent", [["first"], ["second"]]]]));

      const parentNode = await getDoc(col, "parent");
      const firstChild = await getFirstChildNode(service, col, parentNode);
      ctx.expect(firstChild?.text).toBe("first");
    });
  });

  describe("getLastChildNode", () => {
    it("no children", async (ctx) => {
      const col = collection(firestore, ctx.task.id) as CollectionReference<TreeNodeWithText>;

      await setDocs(col, makeTreeNodes("", [["base"]]));

      await ctx.expect(getLastChildNode(service, col, await getDoc(col, "base"))).resolves.toBeUndefined();
    });

    it("last child exists", async (ctx) => {
      const col = collection(firestore, ctx.task.id) as CollectionReference<TreeNodeWithText>;

      await setDocs(col, makeTreeNodes("", [["parent", [["first"], ["last"]]]]));

      const parentNode = await getDoc(col, "parent");
      const lastChild = await getLastChildNode(service, col, parentNode);
      ctx.expect(lastChild?.text).toBe("last");
    });
  });

  describe("getAboveNode", () => {
    it("first sibling - returns parent", async (ctx) => {
      const col = collection(firestore, ctx.task.id) as CollectionReference<TreeNodeWithText>;

      await setDocs(col, makeTreeNodes("", [["parent", [["child"]]]]));

      const childNode = await getDoc(col, "child");
      const aboveNode = await getAboveNode(service, col, childNode);
      ctx.expect(aboveNode?.text).toBe("parent");
    });

    it("has prev sibling - returns bottom of prev sibling", async (ctx) => {
      const col = collection(firestore, ctx.task.id) as CollectionReference<TreeNodeWithText>;

      await setDocs(col, makeTreeNodes("", [["parent", [["prev", [["prevChild"]]], ["current"]]]]));

      const currentNode = await getDoc(col, "current");
      const aboveNode = await getAboveNode(service, col, currentNode);
      ctx.expect(aboveNode?.text).toBe("prevChild");
    });

    it("has prev sibling without children - returns prev sibling", async (ctx) => {
      const col = collection(firestore, ctx.task.id) as CollectionReference<TreeNodeWithText>;

      await setDocs(col, makeTreeNodes("", [["parent", [["prev"], ["current"]]]]));

      const currentNode = await getDoc(col, "current");
      const aboveNode = await getAboveNode(service, col, currentNode);
      ctx.expect(aboveNode?.text).toBe("prev");
    });
  });

  describe("getBelowNode", () => {
    it("has children - returns first child", async (ctx) => {
      const col = collection(firestore, ctx.task.id) as CollectionReference<TreeNodeWithText>;

      await setDocs(col, makeTreeNodes("", [["parent", [["child"]]]]));

      const parentNode = await getDoc(col, "parent");
      const belowNode = await getBelowNode(service, col, parentNode);
      ctx.expect(belowNode?.text).toBe("child");
    });

    it("no children but has next sibling - returns next sibling", async (ctx) => {
      const col = collection(firestore, ctx.task.id) as CollectionReference<TreeNodeWithText>;

      await setDocs(col, makeTreeNodes("", [["parent", [["current"], ["next"]]]]));

      const currentNode = await getDoc(col, "current");
      const belowNode = await getBelowNode(service, col, currentNode);
      ctx.expect(belowNode?.text).toBe("next");
    });

    it("no children no next sibling - returns parent's next sibling", async (ctx) => {
      const col = collection(firestore, ctx.task.id) as CollectionReference<TreeNodeWithText>;

      await setDocs(col, makeTreeNodes("", [["parent", [["current"]]], ["uncle"]]));

      const currentNode = await getDoc(col, "current");
      const belowNode = await getBelowNode(service, col, currentNode);
      ctx.expect(belowNode?.text).toBe("uncle");
    });

    it("last node in tree - returns undefined", async (ctx) => {
      const col = collection(firestore, ctx.task.id) as CollectionReference<TreeNodeWithText>;

      await setDocs(col, makeTreeNodes("", [["parent", [["child"]]]]));

      const childNode = await getDoc(col, "child");
      const belowNode = await getBelowNode(service, col, childNode);
      ctx.expect(belowNode).toBeUndefined();
    });
  });

  describe("getBottomNodeExclusive", () => {
    it("no children", async (ctx) => {
      const col = collection(firestore, ctx.task.id) as CollectionReference<TreeNodeWithText>;

      await setDocs(col, makeTreeNodes("", [["base"]]));

      await ctx.expect(getBottomNodeExclusive(service, col, await getDoc(col, "base"))).resolves.toBeUndefined();
    });

    it("has children", async (ctx) => {
      const col = collection(firestore, ctx.task.id) as CollectionReference<TreeNodeWithText>;

      await setDocs(col, makeTreeNodes("", [["parent", [["child1"], ["child2", [["grandchild"]]]]]]));

      const parentNode = await getDoc(col, "parent");
      const bottomNode = await getBottomNodeExclusive(service, col, parentNode);
      ctx.expect(bottomNode?.text).toBe("grandchild");
    });

    it("has great-grandchildren", async (ctx) => {
      const col = collection(firestore, ctx.task.id) as CollectionReference<TreeNodeWithText>;

      await setDocs(col, makeTreeNodes("", [["parent", [["child", [["grandchild", [["great-grandchild"]]]]]]]]));

      const parentNode = await getDoc(col, "parent");
      const bottomNode = await getBottomNodeExclusive(service, col, parentNode);
      ctx.expect(bottomNode?.text).toBe("great-grandchild");
    });
  });

  describe("addSingle", () => {
    it("adds a single node", async (ctx) => {
      const col = collection(firestore, ctx.task.id) as CollectionReference<TreeNodeWithText>;

      await runTestBatch(async (batch) => {
        addSingle(service, batch, col, "parent", { id: "child", text: "child" });
      });

      const childNode = await getDoc(col, "child");
      ctx.expect(childNode).toEqual({
        id: "child",
        text: "child",
        parentId: "parent",
        order: generateKeyBetween(null, null),
        createdAt: timestampForServerTimestamp,
        updatedAt: timestampForServerTimestamp,
      });
    });
  });

  describe("addPrevSibling", () => {
    it("adds a node before base node", async (ctx) => {
      const col = collection(firestore, ctx.task.id) as CollectionReference<TreeNodeWithText>;

      await setDocs(col, makeTreeNodes("parent", [["base"]]));

      const baseNode = await getDoc(col, "base");
      await runTestBatch(async (batch) => {
        await addPrevSibling(service, batch, col, baseNode, { id: "new", text: "new" });
      });

      const newNode = await getDoc(col, "new");
      ctx.expect(newNode).toEqual({
        id: "new",
        text: "new",
        parentId: "parent",
        order: generateKeyBetween(null, baseNode.order),
        createdAt: timestampForServerTimestamp,
        updatedAt: timestampForServerTimestamp,
      });
      // verify unchanged nodes
      ctx.expect(await getDoc(col, "base")).toEqual(baseNode);
    });

    it("adds a node between two nodes", async (ctx) => {
      const col = collection(firestore, ctx.task.id) as CollectionReference<TreeNodeWithText>;

      await setDocs(col, makeTreeNodes("parent", [["first"], ["second"]]));

      const firstNode = await getDoc(col, "first");
      const secondNode = await getDoc(col, "second");
      await runTestBatch(async (batch) => {
        await addPrevSibling(service, batch, col, secondNode, { id: "middle", text: "middle" });
      });

      const middleNode = await getDoc(col, "middle");
      ctx.expect(middleNode).toEqual({
        id: "middle",
        text: "middle",
        parentId: "parent",
        order: generateKeyBetween(firstNode.order, secondNode.order),
        createdAt: timestampForServerTimestamp,
        updatedAt: timestampForServerTimestamp,
      });
      // verify unchanged nodes
      ctx.expect(await getDoc(col, "first")).toEqual(firstNode);
      ctx.expect(await getDoc(col, "second")).toEqual(secondNode);
    });
  });

  describe("addNextSibling", () => {
    it("adds a node after base node", async (ctx) => {
      const col = collection(firestore, ctx.task.id) as CollectionReference<TreeNodeWithText>;

      await setDocs(col, makeTreeNodes("parent", [["base"]]));

      const baseNode = await getDoc(col, "base");
      await runTestBatch(async (batch) => {
        await addNextSibling(service, batch, col, baseNode, { id: "new", text: "new" });
      });

      const newNode = await getDoc(col, "new");
      ctx.expect(newNode).toEqual({
        id: "new",
        text: "new",
        parentId: "parent",
        order: generateKeyBetween(baseNode.order, null),
        createdAt: timestampForServerTimestamp,
        updatedAt: timestampForServerTimestamp,
      });
      // verify unchanged nodes
      ctx.expect(await getDoc(col, "base")).toEqual(baseNode);
    });

    it("adds a node between two nodes", async (ctx) => {
      const col = collection(firestore, ctx.task.id) as CollectionReference<TreeNodeWithText>;

      await setDocs(col, makeTreeNodes("parent", [["first"], ["second"]]));

      const firstNode = await getDoc(col, "first");
      const secondNode = await getDoc(col, "second");
      await runTestBatch(async (batch) => {
        await addNextSibling(service, batch, col, firstNode, { id: "middle", text: "middle" });
      });

      const middleNode = await getDoc(col, "middle");
      ctx.expect(middleNode).toEqual({
        id: "middle",
        text: "middle",
        parentId: "parent",
        order: generateKeyBetween(firstNode.order, secondNode.order),
        createdAt: timestampForServerTimestamp,
        updatedAt: timestampForServerTimestamp,
      });
      // verify unchanged nodes
      ctx.expect(await getDoc(col, "first")).toEqual(firstNode);
      ctx.expect(await getDoc(col, "second")).toEqual(secondNode);
    });
  });

  describe("indent", () => {
    it("indents node under previous sibling", async (ctx) => {
      const col = collection(firestore, ctx.task.id) as CollectionReference<TreeNodeWithText>;

      await setDocs(col, makeTreeNodes("parent", [["prev"], ["current"]]));

      const prevNode = await getDoc(col, "prev");
      const currentNode = await getDoc(col, "current");
      await runTestBatch(async (batch) => {
        await indent(service, batch, col, currentNode);
      });

      const updatedCurrentNode = await getDoc(col, "current");
      ctx.expect(updatedCurrentNode).toEqual({
        id: "current",
        text: "current",
        parentId: "prev",
        order: generateKeyBetween(null, null),
        createdAt: timestampForCreatedAt,
        updatedAt: timestampForServerTimestamp,
      });
      // verify unchanged nodes
      ctx.expect(await getDoc(col, "prev")).toEqual(prevNode);
    });

    it("indents after last child of prev sibling", async (ctx) => {
      const col = collection(firestore, ctx.task.id) as CollectionReference<TreeNodeWithText>;

      await setDocs(col, makeTreeNodes("parent", [["prev", [["prevChild"]]], ["current"]]));

      const prevNode = await getDoc(col, "prev");
      const prevChildNode = await getDoc(col, "prevChild");
      const currentNode = await getDoc(col, "current");
      await runTestBatch(async (batch) => {
        await indent(service, batch, col, currentNode);
      });

      const updatedCurrentNode = await getDoc(col, "current");
      ctx.expect(updatedCurrentNode).toEqual({
        id: "current",
        text: "current",
        parentId: "prev",
        order: generateKeyBetween(prevChildNode.order, null),
        createdAt: timestampForCreatedAt,
        updatedAt: timestampForServerTimestamp,
      });
      // verify unchanged nodes
      ctx.expect(await getDoc(col, "prev")).toEqual(prevNode);
      ctx.expect(await getDoc(col, "prevChild")).toEqual(prevChildNode);
    });

    it("does nothing when no prev sibling", async (ctx) => {
      const col = collection(firestore, ctx.task.id) as CollectionReference<TreeNodeWithText>;

      await setDocs(col, makeTreeNodes("parent", [["current"]]));

      const currentNode = await getDoc(col, "current");
      await runTestBatch(async (batch) => {
        await indent(service, batch, col, currentNode);
      });

      // verify unchanged
      ctx.expect(await getDoc(col, "current")).toEqual(currentNode);
    });

    it("indents node with children", async (ctx) => {
      const col = collection(firestore, ctx.task.id) as CollectionReference<TreeNodeWithText>;

      await setDocs(col, makeTreeNodes("parent", [["prev"], ["current", [["child"]]]]));

      const prevNode = await getDoc(col, "prev");
      const currentNode = await getDoc(col, "current");
      const childNode = await getDoc(col, "child");
      await runTestBatch(async (batch) => {
        await indent(service, batch, col, currentNode);
      });

      const updatedCurrentNode = await getDoc(col, "current");
      ctx.expect(updatedCurrentNode).toEqual({
        id: "current",
        text: "current",
        parentId: "prev",
        order: generateKeyBetween(null, null),
        createdAt: timestampForCreatedAt,
        updatedAt: timestampForServerTimestamp,
      });
      // verify unchanged nodes
      ctx.expect(await getDoc(col, "prev")).toEqual(prevNode);
      ctx.expect(await getDoc(col, "child")).toEqual(childNode);
    });
  });

  describe("dedent", () => {
    it("dedents node to parent's sibling", async (ctx) => {
      const col = collection(firestore, ctx.task.id) as CollectionReference<TreeNodeWithText>;

      await setDocs(col, makeTreeNodes("grandparent", [["parent", [["current"]]]]));

      const parentNode = await getDoc(col, "parent");
      const currentNode = await getDoc(col, "current");
      await runTestBatch(async (batch) => {
        await dedent(service, batch, col, currentNode);
      });

      const updatedCurrentNode = await getDoc(col, "current");
      ctx.expect(updatedCurrentNode).toEqual({
        id: "current",
        text: "current",
        parentId: "grandparent",
        order: generateKeyBetween(parentNode.order, null),
        createdAt: timestampForCreatedAt,
        updatedAt: timestampForServerTimestamp,
      });
      // verify unchanged nodes
      ctx.expect(await getDoc(col, "parent")).toEqual(parentNode);
    });

    it("does nothing when no parent", async (ctx) => {
      const col = collection(firestore, ctx.task.id) as CollectionReference<TreeNodeWithText>;

      const nodes = makeTreeNodes("", [["current"]]);
      nodes[0].parentId = "";
      await setDocs(col, nodes);

      const currentNode = await getDoc(col, "current");
      await runTestBatch(async (batch) => {
        await dedent(service, batch, col, currentNode);
      });

      // verify unchanged
      ctx.expect(await getDoc(col, "current")).toEqual(currentNode);
    });

    it("dedents node with children", async (ctx) => {
      const col = collection(firestore, ctx.task.id) as CollectionReference<TreeNodeWithText>;

      await setDocs(col, makeTreeNodes("grandparent", [["parent", [["current", [["child"]]]]]]));

      const parentNode = await getDoc(col, "parent");
      const currentNode = await getDoc(col, "current");
      const childNode = await getDoc(col, "child");
      await runTestBatch(async (batch) => {
        await dedent(service, batch, col, currentNode);
      });

      const updatedCurrentNode = await getDoc(col, "current");
      ctx.expect(updatedCurrentNode).toEqual({
        id: "current",
        text: "current",
        parentId: "grandparent",
        order: generateKeyBetween(parentNode.order, null),
        createdAt: timestampForCreatedAt,
        updatedAt: timestampForServerTimestamp,
      });
      // verify unchanged nodes
      ctx.expect(await getDoc(col, "parent")).toEqual(parentNode);
      ctx.expect(await getDoc(col, "child")).toEqual(childNode);
    });
  });

  describe("movePrev", () => {
    it("moves node before prev sibling", async (ctx) => {
      const col = collection(firestore, ctx.task.id) as CollectionReference<TreeNodeWithText>;

      await setDocs(col, makeTreeNodes("parent", [["first"], ["second"]]));

      const firstNode = await getDoc(col, "first");
      const secondNode = await getDoc(col, "second");
      await runTestBatch(async (batch) => {
        await movePrev(service, batch, col, secondNode);
      });

      const updatedSecondNode = await getDoc(col, "second");
      ctx.expect(updatedSecondNode).toEqual({
        id: "second",
        text: "second",
        parentId: "parent",
        order: generateKeyBetween(null, firstNode.order),
        createdAt: timestampForCreatedAt,
        updatedAt: timestampForServerTimestamp,
      });
      // verify unchanged nodes
      ctx.expect(await getDoc(col, "first")).toEqual(firstNode);
    });

    it("does nothing when no prev sibling", async (ctx) => {
      const col = collection(firestore, ctx.task.id) as CollectionReference<TreeNodeWithText>;

      await setDocs(col, makeTreeNodes("parent", [["current"]]));

      const currentNode = await getDoc(col, "current");
      await runTestBatch(async (batch) => {
        await movePrev(service, batch, col, currentNode);
      });

      // verify unchanged
      ctx.expect(await getDoc(col, "current")).toEqual(currentNode);
    });

    it("moves node with children", async (ctx) => {
      const col = collection(firestore, ctx.task.id) as CollectionReference<TreeNodeWithText>;

      await setDocs(col, makeTreeNodes("parent", [["first"], ["second", [["child"]]]]));

      const firstNode = await getDoc(col, "first");
      const secondNode = await getDoc(col, "second");
      const childNode = await getDoc(col, "child");
      await runTestBatch(async (batch) => {
        await movePrev(service, batch, col, secondNode);
      });

      const updatedSecondNode = await getDoc(col, "second");
      ctx.expect(updatedSecondNode).toEqual({
        id: "second",
        text: "second",
        parentId: "parent",
        order: generateKeyBetween(null, firstNode.order),
        createdAt: timestampForCreatedAt,
        updatedAt: timestampForServerTimestamp,
      });
      // verify unchanged nodes
      ctx.expect(await getDoc(col, "first")).toEqual(firstNode);
      ctx.expect(await getDoc(col, "child")).toEqual(childNode);
    });
  });

  describe("moveNext", () => {
    it("moves node after next sibling", async (ctx) => {
      const col = collection(firestore, ctx.task.id) as CollectionReference<TreeNodeWithText>;

      await setDocs(col, makeTreeNodes("parent", [["first"], ["second"]]));

      const firstNode = await getDoc(col, "first");
      const secondNode = await getDoc(col, "second");
      await runTestBatch(async (batch) => {
        await moveNext(service, batch, col, firstNode);
      });

      const updatedFirstNode = await getDoc(col, "first");
      ctx.expect(updatedFirstNode).toEqual({
        id: "first",
        text: "first",
        parentId: "parent",
        order: generateKeyBetween(secondNode.order, null),
        createdAt: timestampForCreatedAt,
        updatedAt: timestampForServerTimestamp,
      });
      // verify unchanged nodes
      ctx.expect(await getDoc(col, "second")).toEqual(secondNode);
    });

    it("does nothing when no next sibling", async (ctx) => {
      const col = collection(firestore, ctx.task.id) as CollectionReference<TreeNodeWithText>;

      await setDocs(col, makeTreeNodes("parent", [["current"]]));

      const currentNode = await getDoc(col, "current");
      await runTestBatch(async (batch) => {
        await moveNext(service, batch, col, currentNode);
      });

      // verify unchanged
      ctx.expect(await getDoc(col, "current")).toEqual(currentNode);
    });

    it("moves node with children", async (ctx) => {
      const col = collection(firestore, ctx.task.id) as CollectionReference<TreeNodeWithText>;

      await setDocs(col, makeTreeNodes("parent", [["first", [["child"]]], ["second"]]));

      const firstNode = await getDoc(col, "first");
      const secondNode = await getDoc(col, "second");
      const childNode = await getDoc(col, "child");
      await runTestBatch(async (batch) => {
        await moveNext(service, batch, col, firstNode);
      });

      const updatedFirstNode = await getDoc(col, "first");
      ctx.expect(updatedFirstNode).toEqual({
        id: "first",
        text: "first",
        parentId: "parent",
        order: generateKeyBetween(secondNode.order, null),
        createdAt: timestampForCreatedAt,
        updatedAt: timestampForServerTimestamp,
      });
      // verify unchanged nodes
      ctx.expect(await getDoc(col, "second")).toEqual(secondNode);
      ctx.expect(await getDoc(col, "child")).toEqual(childNode);
    });
  });

  describe("remove", () => {
    it("removes a node without children", async (ctx) => {
      const col = collection(firestore, ctx.task.id) as CollectionReference<TreeNodeWithText>;

      await setDocs(col, makeTreeNodes("parent", [["toRemove"]]));

      const nodeToRemove = await getDoc(col, "toRemove");
      await runTestBatch(async (batch) => {
        await remove(service, batch, col, nodeToRemove);
      });

      const removedNode = await getDoc(col, "toRemove").catch(() => undefined);
      ctx.expect(removedNode).toBeUndefined();
    });

    it("throws error when node has children", async (ctx) => {
      const col = collection(firestore, ctx.task.id) as CollectionReference<TreeNodeWithText>;

      await setDocs(col, makeTreeNodes("parent", [["toRemove", [["child"]]]]));

      const nodeToRemove = await getDoc(col, "toRemove");

      await ctx
        .expect(
          runTestBatch(async (batch) => {
            await remove(service, batch, col, nodeToRemove);
          }),
        )
        .rejects.toThrowError("cannot delete node with children");
    });
  });
});
