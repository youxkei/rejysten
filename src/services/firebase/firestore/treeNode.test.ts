import { type CollectionReference, collection, Timestamp, writeBatch } from "firebase/firestore";
import { describe, test, vi } from "vitest";

import {
  getDoc,
  getDocs,
  serviceForTest,
  setDocs,
  timestampForCreatedAt,
  timestampForServerTimestamp,
  firestoreForTest,
} from "@/services/firebase/firestore/test";
import {
  type TreeNode,
  getFirstChildNode,
  dedent,
  indent,
  getLastChildNode,
  getAboveNode,
  getBelowNode,
  unlinkFromTree,
  addPrevSibling,
  addNextSibling,
  movePrev,
  moveNext,
  remove,
  getNextNode,
  getPrevNode,
  getParentNode,
  getBottomNodeExclusive,
} from "@/services/firebase/firestore/treeNode";

type TreeNodeWithText = TreeNode & { text: string };
type TreeNodeFixture = [string, TreeNodeFixture[]?];

type MakeTreeNodesResult = TreeNodeWithText[] & { bottomNode?: TreeNodeWithText };
type MakeTreeNodeResult = [TreeNodeWithText, ...TreeNodeWithText[]] & { bottomNode: TreeNodeWithText };

function makeTreeNodes(parentId: string, fixtures: TreeNodeFixture[]): MakeTreeNodesResult {
  const treeNodes = fixtures.map((fixture) => makeTreeNode(parentId, fixture));

  for (let i = 0; i < treeNodes.length; i++) {
    if (i == 0) {
      treeNodes[i][0].aboveId = parentId;
    }

    if (i - 1 >= 0) {
      treeNodes[i][0].prevId = treeNodes[i - 1][0].text;
      treeNodes[i][0].aboveId = treeNodes[i - 1].bottomNode.text;
    }

    if (i + 1 < treeNodes.length) {
      treeNodes[i][0].nextId = treeNodes[i + 1][0].text;
      treeNodes[i].bottomNode.belowId = treeNodes[i + 1][0].text;
    }
  }

  const result = treeNodes.flat() as MakeTreeNodesResult;
  if (result.length > 0) {
    result.bottomNode = treeNodes[treeNodes.length - 1].bottomNode;
  }

  return result;
}

function makeTreeNode(parentId: string, [text, children]: TreeNodeFixture): MakeTreeNodeResult {
  const node = {
    text,
    parentId,
    prevId: "",
    nextId: "",
    aboveId: parentId,
    belowId: "",
    createdAt: timestampForCreatedAt,
    updatedAt: timestampForCreatedAt,
  };
  const childrenNodes = makeTreeNodes(text, children ?? []);
  const result = [node, ...childrenNodes] as MakeTreeNodeResult;

  if (childrenNodes.length > 0) {
    node.belowId = childrenNodes[0].text;
  }

  if (childrenNodes.bottomNode) {
    result.bottomNode = childrenNodes.bottomNode;
  } else {
    result.bottomNode = node;
  }

  return result;
}

describe("treeNode", () => {
  vi.mock(import("firebase/firestore"), async (importOriginal) => {
    const mod = await importOriginal();

    return {
      ...mod,
      serverTimestamp: () => timestampForServerTimestamp,
    };
  });

  describe("getPrevNode", () => {
    test("no prev node", async (test) => {
      const now = new Date();
      const tid = `${test.task.id}_${now.getTime()}`;

      const col = collection(firestoreForTest, tid) as CollectionReference<TreeNodeWithText>;

      await setDocs(col, makeTreeNode("", ["base"]));

      await test.expect(getPrevNode(serviceForTest, col, await getDoc(col, "base"))).resolves.toBeUndefined();
    });

    test("prev node exists", async (test) => {
      const now = new Date();
      const tid = `${test.task.id}_${now.getTime()}`;

      const col = collection(firestoreForTest, tid) as CollectionReference<TreeNodeWithText>;

      await setDocs(col, makeTreeNodes("", [["prev"], ["base"]]));

      await test.expect(getPrevNode(serviceForTest, col, await getDoc(col, "base"))).resolves.toEqual({
        id: "prev",
        text: "prev",
        parentId: "",
        prevId: "",
        nextId: "base",
        aboveId: "",
        belowId: "base",
        createdAt: timestampForCreatedAt,
        updatedAt: timestampForCreatedAt,
      });
    });

    test("invalid baseNode.prevId", async (test) => {
      const now = new Date();
      const tid = `${test.task.id}_${now.getTime()}`;

      const col = collection(firestoreForTest, tid) as CollectionReference<TreeNodeWithText>;

      await setDocs(
        col,
        makeTreeNodes("", [["prev"], ["base"]]).map((node) =>
          node.text === "base" ? { ...node, prevId: "invalid" } : node,
        ),
      );

      await test.expect(getPrevNode(serviceForTest, col, await getDoc(col, "base"))).rejects
        .toThrowErrorMatchingInlineSnapshot(`
          [Error: previous node of baseNode is not exist: {
            "baseNode": {
              "text": "base",
              "parentId": "",
              "prevId": "invalid",
              "nextId": "",
              "aboveId": "prev",
              "belowId": "",
              "createdAt": {
                "type": "firestore/timestamp/1.0",
                "seconds": 4836316028,
                "nanoseconds": 0
              },
              "updatedAt": {
                "type": "firestore/timestamp/1.0",
                "seconds": 4836316028,
                "nanoseconds": 0
              },
              "id": "base"
            }
          }]
        `);
    });

    test("invalid prevNode.nextId", async (test) => {
      const now = new Date();
      const tid = `${test.task.id}_${now.getTime()}`;

      const col = collection(firestoreForTest, tid) as CollectionReference<TreeNodeWithText>;

      await setDocs(
        col,
        makeTreeNodes("", [["prev"], ["base"]]).map((node) =>
          node.text === "prev" ? { ...node, nextId: "invalid" } : node,
        ),
      );

      await test.expect(getPrevNode(serviceForTest, col, await getDoc(col, "base"))).rejects
        .toThrowErrorMatchingInlineSnapshot(`
          [Error: next node of previous node of baseNode is not baseNode: {
            "baseNode": {
              "text": "base",
              "parentId": "",
              "prevId": "prev",
              "nextId": "",
              "aboveId": "prev",
              "belowId": "",
              "createdAt": {
                "type": "firestore/timestamp/1.0",
                "seconds": 4836316028,
                "nanoseconds": 0
              },
              "updatedAt": {
                "type": "firestore/timestamp/1.0",
                "seconds": 4836316028,
                "nanoseconds": 0
              },
              "id": "base"
            },
            "prevNode": {
              "text": "prev",
              "parentId": "",
              "prevId": "",
              "nextId": "invalid",
              "aboveId": "",
              "belowId": "base",
              "createdAt": {
                "type": "firestore/timestamp/1.0",
                "seconds": 4836316028,
                "nanoseconds": 0
              },
              "updatedAt": {
                "type": "firestore/timestamp/1.0",
                "seconds": 4836316028,
                "nanoseconds": 0
              },
              "id": "prev"
            }
          }]
        `);
    });

    test("different parentId", async (test) => {
      const now = new Date();
      const tid = `${test.task.id}_${now.getTime()}`;

      const col = collection(firestoreForTest, tid) as CollectionReference<TreeNodeWithText>;

      await setDocs(
        col,
        makeTreeNodes("foo", [["prev"], ["base"]]).map((node) =>
          node.text === "base" ? { ...node, parentId: "bar" } : node,
        ),
      );

      await test.expect(getPrevNode(serviceForTest, col, await getDoc(col, "base"))).rejects
        .toThrowErrorMatchingInlineSnapshot(`
          [Error: parent node of previous node of baseNode is not one of baseNode: {
            "baseNode": {
              "text": "base",
              "parentId": "bar",
              "prevId": "prev",
              "nextId": "",
              "aboveId": "prev",
              "belowId": "",
              "createdAt": {
                "type": "firestore/timestamp/1.0",
                "seconds": 4836316028,
                "nanoseconds": 0
              },
              "updatedAt": {
                "type": "firestore/timestamp/1.0",
                "seconds": 4836316028,
                "nanoseconds": 0
              },
              "id": "base"
            },
            "prevNode": {
              "text": "prev",
              "parentId": "foo",
              "prevId": "",
              "nextId": "base",
              "aboveId": "foo",
              "belowId": "base",
              "createdAt": {
                "type": "firestore/timestamp/1.0",
                "seconds": 4836316028,
                "nanoseconds": 0
              },
              "updatedAt": {
                "type": "firestore/timestamp/1.0",
                "seconds": 4836316028,
                "nanoseconds": 0
              },
              "id": "prev"
            }
          }]
        `);
    });
  });

  describe("getNextNode", () => {
    test("no next node", async (test) => {
      const now = new Date();
      const tid = `${test.task.id}_${now.getTime()}`;

      const col = collection(firestoreForTest, tid) as CollectionReference<TreeNodeWithText>;

      await setDocs(col, makeTreeNode("", ["base"]));

      await test.expect(getNextNode(serviceForTest, col, await getDoc(col, "base"))).resolves.toBeUndefined();
    });

    test("next node exists", async (test) => {
      const now = new Date();
      const tid = `${test.task.id}_${now.getTime()}`;

      const col = collection(firestoreForTest, tid) as CollectionReference<TreeNodeWithText>;

      await setDocs(col, makeTreeNodes("", [["base"], ["next"]]));

      await test.expect(getNextNode(serviceForTest, col, await getDoc(col, "base"))).resolves.toEqual({
        id: "next",
        text: "next",
        prevId: "base",
        nextId: "",
        aboveId: "base",
        belowId: "",
        parentId: "",
        createdAt: timestampForCreatedAt,
        updatedAt: timestampForCreatedAt,
      });
    });

    test("invalid baseNode.nextId", async (test) => {
      const now = new Date();
      const tid = `${test.task.id}_${now.getTime()}`;

      const col = collection(firestoreForTest, tid) as CollectionReference<TreeNodeWithText>;

      await setDocs(
        col,
        makeTreeNodes("", [["base"], ["next"]]).map((node) =>
          node.text === "base" ? { ...node, nextId: "invalid" } : node,
        ),
      );

      await test.expect(getNextNode(serviceForTest, col, await getDoc(col, "base"))).rejects
        .toThrowErrorMatchingInlineSnapshot(`
          [Error: next node of baseNode is not exist: {
            "baseNode": {
              "text": "base",
              "parentId": "",
              "prevId": "",
              "nextId": "invalid",
              "aboveId": "",
              "belowId": "next",
              "createdAt": {
                "type": "firestore/timestamp/1.0",
                "seconds": 4836316028,
                "nanoseconds": 0
              },
              "updatedAt": {
                "type": "firestore/timestamp/1.0",
                "seconds": 4836316028,
                "nanoseconds": 0
              },
              "id": "base"
            }
          }]
        `);
    });

    test("invalid nextNode.prevId", async (test) => {
      const now = new Date();
      const tid = `${test.task.id}_${now.getTime()}`;

      const col = collection(firestoreForTest, tid) as CollectionReference<TreeNodeWithText>;

      await setDocs(
        col,
        makeTreeNodes("", [["base"], ["next"]]).map((node) =>
          node.text === "next" ? { ...node, prevId: "invalid" } : node,
        ),
      );

      await test.expect(getNextNode(serviceForTest, col, await getDoc(col, "base"))).rejects
        .toThrowErrorMatchingInlineSnapshot(`
          [Error: previous node of next node of baseNode is not baseNode: {
            "baseNode": {
              "text": "base",
              "parentId": "",
              "prevId": "",
              "nextId": "next",
              "aboveId": "",
              "belowId": "next",
              "createdAt": {
                "type": "firestore/timestamp/1.0",
                "seconds": 4836316028,
                "nanoseconds": 0
              },
              "updatedAt": {
                "type": "firestore/timestamp/1.0",
                "seconds": 4836316028,
                "nanoseconds": 0
              },
              "id": "base"
            },
            "nextNode": {
              "text": "next",
              "parentId": "",
              "prevId": "invalid",
              "nextId": "",
              "aboveId": "base",
              "belowId": "",
              "createdAt": {
                "type": "firestore/timestamp/1.0",
                "seconds": 4836316028,
                "nanoseconds": 0
              },
              "updatedAt": {
                "type": "firestore/timestamp/1.0",
                "seconds": 4836316028,
                "nanoseconds": 0
              },
              "id": "next"
            }
          }]
        `);
    });

    test("different parentId", async (test) => {
      const now = new Date();
      const tid = `${test.task.id}_${now.getTime()}`;

      const col = collection(firestoreForTest, tid) as CollectionReference<TreeNodeWithText>;

      await setDocs(
        col,
        makeTreeNodes("foo", [["base"], ["next"]]).map((node) =>
          node.text === "next" ? { ...node, parentId: "bar" } : node,
        ),
      );

      await test.expect(getNextNode(serviceForTest, col, await getDoc(col, "base"))).rejects
        .toThrowErrorMatchingInlineSnapshot(`
          [Error: parent node of next node of baseNode is not one of baseNode: {
            "baseNode": {
              "text": "base",
              "parentId": "foo",
              "prevId": "",
              "nextId": "next",
              "aboveId": "foo",
              "belowId": "next",
              "createdAt": {
                "type": "firestore/timestamp/1.0",
                "seconds": 4836316028,
                "nanoseconds": 0
              },
              "updatedAt": {
                "type": "firestore/timestamp/1.0",
                "seconds": 4836316028,
                "nanoseconds": 0
              },
              "id": "base"
            },
            "nextNode": {
              "text": "next",
              "parentId": "bar",
              "prevId": "base",
              "nextId": "",
              "aboveId": "base",
              "belowId": "",
              "createdAt": {
                "type": "firestore/timestamp/1.0",
                "seconds": 4836316028,
                "nanoseconds": 0
              },
              "updatedAt": {
                "type": "firestore/timestamp/1.0",
                "seconds": 4836316028,
                "nanoseconds": 0
              },
              "id": "next"
            }
          }]
        `);
    });
  });

  describe("getParentNode", () => {
    test("no parent node", async (test) => {
      const now = new Date();
      const tid = `${test.task.id}_${now.getTime()}`;

      const col = collection(firestoreForTest, tid) as CollectionReference<TreeNodeWithText>;

      await setDocs(col, makeTreeNode("", ["base"]));

      await test.expect(getParentNode(serviceForTest, col, await getDoc(col, "base"))).resolves.toBeUndefined();
    });

    test("parent node exists", async (test) => {
      const now = new Date();
      const tid = `${test.task.id}_${now.getTime()}`;

      const col = collection(firestoreForTest, tid) as CollectionReference<TreeNodeWithText>;

      await setDocs(col, makeTreeNode("", ["parent", [["base"]]]));

      await test.expect(getParentNode(serviceForTest, col, await getDoc(col, "base"))).resolves.toEqual({
        id: "parent",
        text: "parent",
        parentId: "",
        prevId: "",
        nextId: "",
        aboveId: "",
        belowId: "base",
        createdAt: timestampForCreatedAt,
        updatedAt: timestampForCreatedAt,
      });
    });

    test("baseNode.parentId refers to a node of another collection", async (test) => {
      const now = new Date();
      const tid = `${test.task.id}_${now.getTime()}`;

      const col = collection(firestoreForTest, tid) as CollectionReference<TreeNodeWithText>;

      await setDocs(col, makeTreeNode("another_collection_id", ["base"]));

      await test.expect(getParentNode(serviceForTest, col, await getDoc(col, "base"))).resolves.toBeUndefined();
    });
  });

  describe("getFirstChildNode", () => {
    test("no first child node", async (test) => {
      const now = new Date();
      const tid = `${test.task.id}_${now.getTime()}`;

      const col = collection(firestoreForTest, tid) as CollectionReference<TreeNodeWithText>;

      await setDocs(col, makeTreeNode("", ["base"]));

      await test.expect(getFirstChildNode(serviceForTest, col, await getDoc(col, "base"))).resolves.toBeUndefined();
    });

    test("first child node exists", async (test) => {
      const now = new Date();
      const tid = `${test.task.id}_${now.getTime()}`;

      const col = collection(firestoreForTest, tid) as CollectionReference<TreeNodeWithText>;

      await setDocs(col, makeTreeNode("", ["base", [["first"], ["middle"], ["last"]]]));

      await test.expect(getFirstChildNode(serviceForTest, col, await getDoc(col, "base"))).resolves.toEqual({
        id: "first",
        text: "first",
        parentId: "base",
        prevId: "",
        nextId: "middle",
        aboveId: "base",
        belowId: "middle",
        createdAt: timestampForCreatedAt,
        updatedAt: timestampForCreatedAt,
      });
    });

    test("multiple first child nodes", async (test) => {
      const now = new Date();
      const tid = `${test.task.id}_${now.getTime()}`;

      const col = collection(firestoreForTest, tid) as CollectionReference<TreeNodeWithText>;

      await setDocs(
        col,
        makeTreeNode("", ["base", [["first1"], ["first2"]]]).map((node) =>
          node.text === "first2" ? { ...node, prevId: "" } : node,
        ),
      );

      await test.expect(getFirstChildNode(serviceForTest, col, await getDoc(col, "base"))).rejects
        .toThrowErrorMatchingInlineSnapshot(`
          [Error: multiple first child nodes: {
            "baseNode": {
              "text": "base",
              "parentId": "",
              "prevId": "",
              "nextId": "",
              "aboveId": "",
              "belowId": "first1",
              "createdAt": {
                "type": "firestore/timestamp/1.0",
                "seconds": 4836316028,
                "nanoseconds": 0
              },
              "updatedAt": {
                "type": "firestore/timestamp/1.0",
                "seconds": 4836316028,
                "nanoseconds": 0
              },
              "id": "base"
            },
            "childrenDocs": [
              {
                "text": "first1",
                "parentId": "base",
                "prevId": "",
                "nextId": "first2",
                "aboveId": "base",
                "belowId": "first2",
                "createdAt": {
                  "type": "firestore/timestamp/1.0",
                  "seconds": 4836316028,
                  "nanoseconds": 0
                },
                "updatedAt": {
                  "type": "firestore/timestamp/1.0",
                  "seconds": 4836316028,
                  "nanoseconds": 0
                },
                "id": "first1"
              },
              {
                "text": "first2",
                "parentId": "base",
                "prevId": "",
                "nextId": "",
                "aboveId": "first1",
                "belowId": "",
                "createdAt": {
                  "type": "firestore/timestamp/1.0",
                  "seconds": 4836316028,
                  "nanoseconds": 0
                },
                "updatedAt": {
                  "type": "firestore/timestamp/1.0",
                  "seconds": 4836316028,
                  "nanoseconds": 0
                },
                "id": "first2"
              }
            ]
          }]
        `);
    });
  });

  describe("getLastChildNode", () => {
    test("no last child node", async (test) => {
      const now = new Date();
      const tid = `${test.task.id}_${now.getTime()}`;

      const col = collection(firestoreForTest, tid) as CollectionReference<TreeNodeWithText>;

      await setDocs(col, makeTreeNode("", ["base"]));

      await test.expect(getLastChildNode(serviceForTest, col, await getDoc(col, "base"))).resolves.toBeUndefined();
    });

    test("last child node exists", async (test) => {
      const now = new Date();
      const tid = `${test.task.id}_${now.getTime()}`;

      const col = collection(firestoreForTest, tid) as CollectionReference<TreeNodeWithText>;

      await setDocs(col, makeTreeNode("", ["base", [["first"], ["middle"], ["last"]]]));

      await test.expect(getLastChildNode(serviceForTest, col, await getDoc(col, "base"))).resolves.toEqual({
        id: "last",
        text: "last",
        parentId: "base",
        prevId: "middle",
        nextId: "",
        aboveId: "middle",
        belowId: "",
        createdAt: timestampForCreatedAt,
        updatedAt: timestampForCreatedAt,
      });
    });

    test("multiple last child nodes", async (test) => {
      const now = new Date();
      const tid = `${test.task.id}_${now.getTime()}`;

      const col = collection(firestoreForTest, tid) as CollectionReference<TreeNodeWithText>;

      await setDocs(
        col,
        makeTreeNode("", ["base", [["last1"], ["last2"]]]).map((node) =>
          node.text === "last1" ? { ...node, nextId: "" } : node,
        ),
      );

      await test.expect(getLastChildNode(serviceForTest, col, await getDoc(col, "base"))).rejects
        .toThrowErrorMatchingInlineSnapshot(`
          [Error: multiple last child nodes: {
            "baseNode": {
              "text": "base",
              "parentId": "",
              "prevId": "",
              "nextId": "",
              "aboveId": "",
              "belowId": "last1",
              "createdAt": {
                "type": "firestore/timestamp/1.0",
                "seconds": 4836316028,
                "nanoseconds": 0
              },
              "updatedAt": {
                "type": "firestore/timestamp/1.0",
                "seconds": 4836316028,
                "nanoseconds": 0
              },
              "id": "base"
            },
            "childrenDocs": [
              {
                "text": "last1",
                "parentId": "base",
                "prevId": "",
                "nextId": "",
                "aboveId": "base",
                "belowId": "last2",
                "createdAt": {
                  "type": "firestore/timestamp/1.0",
                  "seconds": 4836316028,
                  "nanoseconds": 0
                },
                "updatedAt": {
                  "type": "firestore/timestamp/1.0",
                  "seconds": 4836316028,
                  "nanoseconds": 0
                },
                "id": "last1"
              },
              {
                "text": "last2",
                "parentId": "base",
                "prevId": "last1",
                "nextId": "",
                "aboveId": "last1",
                "belowId": "",
                "createdAt": {
                  "type": "firestore/timestamp/1.0",
                  "seconds": 4836316028,
                  "nanoseconds": 0
                },
                "updatedAt": {
                  "type": "firestore/timestamp/1.0",
                  "seconds": 4836316028,
                  "nanoseconds": 0
                },
                "id": "last2"
              }
            ]
          }]
        `);
    });
  });

  describe("unlinkFromTree", () => {
    test("no prev node, no next node", async (test) => {
      const now = new Date();
      const tid = `${test.task.id}_${now.getTime()}`;

      const col = collection(firestoreForTest, tid) as CollectionReference<TreeNodeWithText>;

      await setDocs(col, makeTreeNode("", ["base"]));

      const batch = writeBatch(firestoreForTest);
      await unlinkFromTree(serviceForTest, batch, col, await getDoc(col, "base"));
      await batch.commit();

      await test.expect(getDocs(col)).resolves.toEqual([
        {
          id: "base",
          text: "base",
          parentId: "",
          prevId: "",
          nextId: "",
          aboveId: "",
          belowId: "",
          createdAt: timestampForCreatedAt,
          updatedAt: timestampForServerTimestamp,
        },
      ]);
    });

    test("no prev node, has next node", async (test) => {
      const now = new Date();
      const tid = `${test.task.id}_${now.getTime()}`;

      const col = collection(firestoreForTest, tid) as CollectionReference<TreeNodeWithText>;

      await setDocs(col, makeTreeNodes("", [["base"], ["next"]]));

      const batch = writeBatch(firestoreForTest);
      await unlinkFromTree(serviceForTest, batch, col, await getDoc(col, "base"));
      await batch.commit();

      await test.expect(getDocs(col)).resolves.toEqual([
        {
          id: "base",
          text: "base",
          parentId: "",
          prevId: "",
          nextId: "",
          aboveId: "",
          belowId: "",
          createdAt: timestampForCreatedAt,
          updatedAt: timestampForServerTimestamp,
        },
        {
          id: "next",
          text: "next",
          parentId: "",
          prevId: "",
          nextId: "",
          aboveId: "",
          belowId: "",
          createdAt: timestampForCreatedAt,
          updatedAt: timestampForServerTimestamp,
        },
      ]);
    });

    test("has prev node, no next node", async (test) => {
      const now = new Date();
      const tid = `${test.task.id}_${now.getTime()}`;

      const col = collection(firestoreForTest, tid) as CollectionReference<TreeNodeWithText>;

      await setDocs(col, makeTreeNodes("", [["prev"], ["base"]]));

      const batch = writeBatch(firestoreForTest);
      await unlinkFromTree(serviceForTest, batch, col, await getDoc(col, "base"));
      await batch.commit();

      await test.expect(getDocs(col)).resolves.toEqual([
        {
          id: "base",
          text: "base",
          parentId: "",
          prevId: "",
          nextId: "",
          aboveId: "",
          belowId: "",
          createdAt: timestampForCreatedAt,
          updatedAt: timestampForServerTimestamp,
        },
        {
          id: "prev",
          text: "prev",
          parentId: "",
          prevId: "",
          nextId: "",
          aboveId: "",
          belowId: "",
          createdAt: timestampForCreatedAt,
          updatedAt: timestampForServerTimestamp,
        },
      ]);
    });

    test("has prev node, has next node", async (test) => {
      const now = new Date();
      const tid = `${test.task.id}_${now.getTime()}`;

      const col = collection(firestoreForTest, tid) as CollectionReference<TreeNodeWithText>;

      await setDocs(col, makeTreeNodes("", [["prev"], ["base"], ["next"]]));

      const batch = writeBatch(firestoreForTest);
      await unlinkFromTree(serviceForTest, batch, col, await getDoc(col, "base"));
      await batch.commit();

      await test.expect(getDocs(col)).resolves.toEqual([
        {
          id: "base",
          text: "base",
          parentId: "",
          prevId: "",
          nextId: "",
          aboveId: "",
          belowId: "",
          createdAt: timestampForCreatedAt,
          updatedAt: timestampForServerTimestamp,
        },
        {
          id: "next",
          text: "next",
          parentId: "",
          prevId: "prev",
          nextId: "",
          aboveId: "prev",
          belowId: "",
          createdAt: timestampForCreatedAt,
          updatedAt: timestampForServerTimestamp,
        },
        {
          id: "prev",
          text: "prev",
          parentId: "",
          prevId: "",
          nextId: "next",
          aboveId: "",
          belowId: "next",
          createdAt: timestampForCreatedAt,
          updatedAt: timestampForServerTimestamp,
        },
      ]);
    });

    test("has child of prev node, has next of parent node", async (test) => {
      const now = new Date();
      const tid = `${test.task.id}_${now.getTime()}`;

      const col = collection(firestoreForTest, tid) as CollectionReference<TreeNodeWithText>;

      // prettier-ignore
      await setDocs(col, makeTreeNodes("", [
        ["parent", [
          ["prev", [
            ["child of prev"]
          ]],
          ["base"],
        ]],
        ["next of parent"],
      ]));

      const batch = writeBatch(firestoreForTest);
      await unlinkFromTree(serviceForTest, batch, col, await getDoc(col, "base"));
      await batch.commit();

      await test.expect(getDocs(col)).resolves.toEqual([
        {
          id: "base",
          text: "base",
          parentId: "",
          prevId: "",
          nextId: "",
          aboveId: "",
          belowId: "",
          createdAt: timestampForCreatedAt,
          updatedAt: timestampForServerTimestamp,
        },
        {
          id: "child of prev",
          text: "child of prev",
          parentId: "prev",
          prevId: "",
          nextId: "",
          aboveId: "prev",
          belowId: "next of parent",
          createdAt: timestampForCreatedAt,
          updatedAt: timestampForServerTimestamp,
        },
        {
          id: "next of parent",
          text: "next of parent",
          parentId: "",
          prevId: "parent",
          nextId: "",
          aboveId: "child of prev",
          belowId: "",
          createdAt: timestampForCreatedAt,
          updatedAt: timestampForServerTimestamp,
        },
        {
          id: "parent",
          text: "parent",
          parentId: "",
          prevId: "",
          nextId: "next of parent",
          aboveId: "",
          belowId: "prev",
          createdAt: timestampForCreatedAt,
          updatedAt: timestampForCreatedAt,
        },
        {
          id: "prev",
          text: "prev",
          parentId: "parent",
          prevId: "",
          nextId: "",
          aboveId: "parent",
          belowId: "child of prev",
          createdAt: timestampForCreatedAt,
          updatedAt: timestampForServerTimestamp,
        },
      ]);
    });

    test("has prev node, has next node, has child node", async (test) => {
      const now = new Date();
      const tid = `${test.task.id}_${now.getTime()}`;

      const col = collection(firestoreForTest, tid) as CollectionReference<TreeNodeWithText>;

      await setDocs(col, makeTreeNodes("", [["prev"], ["base", [["child"]]], ["next"]]));

      const batch = writeBatch(firestoreForTest);
      await unlinkFromTree(serviceForTest, batch, col, await getDoc(col, "base"));
      await batch.commit();

      await test.expect(getDocs(col)).resolves.toEqual([
        {
          id: "base",
          text: "base",
          parentId: "",
          prevId: "",
          nextId: "",
          aboveId: "",
          belowId: "child",
          createdAt: timestampForCreatedAt,
          updatedAt: timestampForServerTimestamp,
        },
        {
          id: "child",
          text: "child",
          parentId: "base",
          prevId: "",
          nextId: "",
          aboveId: "base",
          belowId: "",
          createdAt: timestampForCreatedAt,
          updatedAt: timestampForServerTimestamp,
        },
        {
          id: "next",
          text: "next",
          parentId: "",
          prevId: "prev",
          nextId: "",
          aboveId: "prev",
          belowId: "",
          createdAt: timestampForCreatedAt,
          updatedAt: timestampForServerTimestamp,
        },
        {
          id: "prev",
          text: "prev",
          parentId: "",
          prevId: "",
          nextId: "next",
          aboveId: "",
          belowId: "next",
          createdAt: timestampForCreatedAt,
          updatedAt: timestampForServerTimestamp,
        },
      ]);
    });
  });

  describe("getAboveNode", () => {
    test("no prev node, no parent node", async (test) => {
      const now = new Date();
      const tid = `${test.task.id}_${now.getTime()}`;

      const col = collection(firestoreForTest, tid) as CollectionReference<TreeNodeWithText>;
      await setDocs(col, makeTreeNode("", ["base"]));

      await test.expect(getAboveNode(serviceForTest, col, await getDoc(col, "base"))).resolves.toBeUndefined();
    });

    test("no prev node, has parent node", async (test) => {
      const now = new Date();
      const tid = `${test.task.id}_${now.getTime()}`;

      const col = collection(firestoreForTest, tid) as CollectionReference<TreeNodeWithText>;
      await setDocs(col, makeTreeNode("", ["parent", [["base"]]]));

      await test.expect(getAboveNode(serviceForTest, col, await getDoc(col, "base"))).resolves.toEqual({
        id: "parent",
        text: "parent",
        parentId: "",
        prevId: "",
        nextId: "",
        aboveId: "",
        belowId: "base",
        createdAt: timestampForCreatedAt,
        updatedAt: timestampForCreatedAt,
      });
    });

    test("has prev node, no children nodes of prev node", async (test) => {
      const now = new Date();
      const tid = `${test.task.id}_${now.getTime()}`;

      const col = collection(firestoreForTest, tid) as CollectionReference<TreeNodeWithText>;
      await setDocs(col, makeTreeNodes("", [["prev"], ["base"]]));

      await test.expect(getAboveNode(serviceForTest, col, await getDoc(col, "base"))).resolves.toEqual({
        id: "prev",
        text: "prev",
        prevId: "",
        nextId: "base",
        parentId: "",
        aboveId: "",
        belowId: "base",
        createdAt: timestampForCreatedAt,
        updatedAt: timestampForCreatedAt,
      });
    });

    test("has prev node, has children nodes of prev node, no children nodes of children nodes of prev node", async (test) => {
      const now = new Date();
      const tid = `${test.task.id}_${now.getTime()}`;

      const col = collection(firestoreForTest, tid) as CollectionReference<TreeNodeWithText>;
      // prettier-ignore
      await setDocs(col, makeTreeNodes("", [
        ["prev", [
          ["first of prev"],
          ["middle of prev"],
          ["last of prev"]
        ]],
        ["base"],
      ]));

      await test.expect(getAboveNode(serviceForTest, col, await getDoc(col, "base"))).resolves.toEqual({
        id: "last of prev",
        text: "last of prev",
        parentId: "prev",
        prevId: "middle of prev",
        nextId: "",
        aboveId: "middle of prev",
        belowId: "base",
        createdAt: timestampForCreatedAt,
        updatedAt: timestampForCreatedAt,
      });
    });

    test("has prev node, has children nodes of prev node, has children nodes of children nodes of prev node", async (test) => {
      const now = new Date();
      const tid = `${test.task.id}_${now.getTime()}`;

      const col = collection(firestoreForTest, tid) as CollectionReference<TreeNodeWithText>;
      // prettier-ignore
      await setDocs(col, makeTreeNodes("", [
        ["prev", [
          ["first of prev", [
            ["first of first of prev"],
            ["middle of first of prev"],
            ["last of first of prev"],
          ]],
          ["middle of prev", [
            ["first of middle of prev"],
            ["middle of middle of prev"],
            ["last of middle of prev"],
          ]],
          ["last of prev", [
            ["first of last of prev"],
            ["middle of last of prev"],
            ["last of last of prev"],
          ]],
        ]],
        ["base"],
      ]));

      await test.expect(getAboveNode(serviceForTest, col, await getDoc(col, "base"))).resolves.toEqual({
        id: "last of last of prev",
        text: "last of last of prev",
        parentId: "last of prev",
        prevId: "middle of last of prev",
        nextId: "",
        aboveId: "middle of last of prev",
        belowId: "base",
        createdAt: timestampForCreatedAt,
        updatedAt: timestampForCreatedAt,
      });
    });
  });

  describe("getBelowNode", () => {
    test("no child node, no next node, no parent node", async (test) => {
      const now = new Date();
      const tid = `${test.task.id}_${now.getTime()}`;

      const col = collection(firestoreForTest, tid) as CollectionReference<TreeNodeWithText>;
      await setDocs(col, makeTreeNode("", ["base"]));

      await test.expect(getBelowNode(serviceForTest, col, await getDoc(col, "base"))).resolves.toBeUndefined();
    });

    test("no child node, no next node, has parent node, no next of parent node", async (test) => {
      const now = new Date();
      const tid = `${test.task.id}_${now.getTime()}`;

      const col = collection(firestoreForTest, tid) as CollectionReference<TreeNodeWithText>;
      await setDocs(col, makeTreeNode("", ["parent", [["base"]]]));

      await test.expect(getBelowNode(serviceForTest, col, await getDoc(col, "base"))).resolves.toBeUndefined();
    });

    test("has child node, has next node, has next of parent node, has next of parent of parent node", async (test) => {
      const now = new Date();
      const tid = `${test.task.id}_${now.getTime()}`;

      const col = collection(firestoreForTest, tid) as CollectionReference<TreeNodeWithText>;
      // prettier-ignore
      await setDocs(col, makeTreeNodes("", [
        ["parent of parent", [
          ["parent", [
            ["base", [
              ["first child of base"],
              ["middle child of base"],
              ["last child of base"],
            ]],
            ["next"],
          ]],
          ["next of parent"],
        ]],
        ["next of parent of parent"],
      ]));

      await test.expect(getBelowNode(serviceForTest, col, await getDoc(col, "base"))).resolves.toEqual({
        id: "first child of base",
        text: "first child of base",
        parentId: "base",
        prevId: "",
        nextId: "middle child of base",
        aboveId: "base",
        belowId: "middle child of base",
        createdAt: timestampForCreatedAt,
        updatedAt: timestampForCreatedAt,
      });
    });

    test("no child node, has next node, has next of parent node, has next of parent of parent node", async (test) => {
      const now = new Date();
      const tid = `${test.task.id}_${now.getTime()}`;

      const col = collection(firestoreForTest, tid) as CollectionReference<TreeNodeWithText>;
      // prettier-ignore
      await setDocs(col, makeTreeNodes("", [
        ["parent of parent", [
          ["parent", [
            ["base"],
            ["next"],
          ]],
          ["next of parent"],
        ]],
        ["next of parent of parent"],
      ]));

      await test.expect(getBelowNode(serviceForTest, col, await getDoc(col, "base"))).resolves.toEqual({
        id: "next",
        text: "next",
        parentId: "parent",
        prevId: "base",
        nextId: "",
        aboveId: "base",
        belowId: "next of parent",
        createdAt: timestampForCreatedAt,
        updatedAt: timestampForCreatedAt,
      });
    });

    test("no child node, no next node, has next of parent node, has next of parent of parent node", async (test) => {
      const now = new Date();
      const tid = `${test.task.id}_${now.getTime()}`;

      const col = collection(firestoreForTest, tid) as CollectionReference<TreeNodeWithText>;
      // prettier-ignore
      await setDocs(col, makeTreeNodes("", [
        ["parent of parent", [
          ["parent", [
            ["base"],
          ]],
          ["next of parent"],
        ]],
        ["next of parent of parent"],
      ]));

      await test.expect(getBelowNode(serviceForTest, col, await getDoc(col, "base"))).resolves.toEqual({
        id: "next of parent",
        text: "next of parent",
        parentId: "parent of parent",
        prevId: "parent",
        nextId: "",
        aboveId: "base",
        belowId: "next of parent of parent",
        createdAt: timestampForCreatedAt,
        updatedAt: timestampForCreatedAt,
      });
    });

    test("no child node, no next node, no next of parent node, has next of parent of parent node", async (test) => {
      const now = new Date();
      const tid = `${test.task.id}_${now.getTime()}`;

      const col = collection(firestoreForTest, tid) as CollectionReference<TreeNodeWithText>;
      // prettier-ignore
      await setDocs(col, makeTreeNodes("", [
        ["parent of parent", [
          ["parent", [
            ["base"],
          ]],
        ]],
        ["next of parent of parent"],
      ]));

      await test.expect(getBelowNode(serviceForTest, col, await getDoc(col, "base"))).resolves.toEqual({
        id: "next of parent of parent",
        text: "next of parent of parent",
        parentId: "",
        prevId: "parent of parent",
        nextId: "",
        aboveId: "base",
        belowId: "",
        createdAt: timestampForCreatedAt,
        updatedAt: timestampForCreatedAt,
      });
    });
  });

  describe("getBottomNodeExclusive", () => {
    test("no child node", async (test) => {
      const now = new Date();
      const tid = `${test.task.id}_${now.getTime()}`;

      const col = collection(firestoreForTest, tid) as CollectionReference<TreeNodeWithText>;

      await setDocs(col, makeTreeNode("", ["base"]));

      await test
        .expect(getBottomNodeExclusive(serviceForTest, col, await getDoc(col, "base")))
        .resolves.toBeUndefined();
    });

    test("has children nodes, no grandchild node", async (test) => {
      const now = new Date();
      const tid = `${test.task.id}_${now.getTime()}`;

      const col = collection(firestoreForTest, tid) as CollectionReference<TreeNodeWithText>;

      // prettier-ignore
      await setDocs(col, makeTreeNodes("", [
        ["base", [
          ["first child"],
          ["middle child"],
          ["last child"],
        ]],
      ]));

      await test.expect(getBottomNodeExclusive(serviceForTest, col, await getDoc(col, "base"))).resolves.toEqual({
        id: "last child",
        text: "last child",
        parentId: "base",
        prevId: "middle child",
        nextId: "",
        aboveId: "middle child",
        belowId: "",
        createdAt: timestampForCreatedAt,
        updatedAt: timestampForCreatedAt,
      });
    });

    test("has children nodes, has grandchildren nodes, no great-grandchild node", async (test) => {
      const now = new Date();
      const tid = `${test.task.id}_${now.getTime()}`;

      const col = collection(firestoreForTest, tid) as CollectionReference<TreeNodeWithText>;

      // prettier-ignore
      await setDocs(col, makeTreeNodes("", [
        ["base", [
          ["first child"],
          ["middle child"],
          ["last child", [
            ["first grandchild"],
            ["middle grandchild"],
            ["last grandchild"],
          ]],
        ]],
      ]));

      await test.expect(getBottomNodeExclusive(serviceForTest, col, await getDoc(col, "base"))).resolves.toEqual({
        id: "last grandchild",
        text: "last grandchild",
        parentId: "last child",
        prevId: "middle grandchild",
        nextId: "",
        aboveId: "middle grandchild",
        belowId: "",
        createdAt: timestampForCreatedAt,
        updatedAt: timestampForCreatedAt,
      });
    });

    test("has children nodes, has grandchildren nodes, has great-grandchildren nodes", async (test) => {
      const now = new Date();

      const tid = `${test.task.id}_${now.getTime()}`;

      const col = collection(firestoreForTest, tid) as CollectionReference<TreeNodeWithText>;

      // prettier-ignore
      await setDocs(col, makeTreeNodes("", [
        ["base", [
          ["first child"],
          ["middle child"],
          ["last child", [
            ["first grandchild"],
            ["middle grandchild"],
            ["last grandchild", [
              ["first great-grandchild"],
              ["middle great-grandchild"],
              ["last great-grandchild"],
            ]],
          ]],
        ]],
      ]));

      await test.expect(getBottomNodeExclusive(serviceForTest, col, await getDoc(col, "base"))).resolves.toEqual({
        id: "last great-grandchild",
        text: "last great-grandchild",
        parentId: "last grandchild",
        prevId: "middle great-grandchild",
        nextId: "",
        aboveId: "middle great-grandchild",
        belowId: "",
        createdAt: timestampForCreatedAt,
        updatedAt: timestampForCreatedAt,
      });
    });

    test("base node is from another collection, has children nodes", async (test) => {
      const now = new Date();
      const tid = `${test.task.id}_${now.getTime()}`;

      const baseCol = collection(firestoreForTest, `${tid}_col1`) as CollectionReference<{ text: string }>;
      const childrenCol = collection(firestoreForTest, `${tid}_col2`) as CollectionReference<TreeNodeWithText>;

      await setDocs(baseCol, [{ text: "base" }]);
      await setDocs(childrenCol, makeTreeNodes("base", [["first child"], ["middle child"], ["last child"]]));

      await test
        .expect(getBottomNodeExclusive(serviceForTest, childrenCol, await getDoc(baseCol, "base")))
        .resolves.toEqual({
          id: "last child",
          text: "last child",
          parentId: "base",
          prevId: "middle child",
          nextId: "",
          aboveId: "middle child",
          belowId: "",
          createdAt: timestampForCreatedAt,
          updatedAt: timestampForCreatedAt,
        });
    });
  });

  describe("addPrevSibling", () => {
    test("new node, no prev node", async (test) => {
      const now = new Date();
      const tid = `${test.task.id}_${now.getTime()}`;

      const col = collection(firestoreForTest, tid) as CollectionReference<TreeNodeWithText>;

      await setDocs(col, makeTreeNode("", ["parent", [["base"]]]));

      const batch = writeBatch(firestoreForTest);
      await addPrevSibling(serviceForTest, batch, col, await getDoc(col, "base"), {
        id: "newNode",
        text: "newNode",
        parentId: "",
        prevId: "",
        nextId: "",
        aboveId: "",
        belowId: "",
        createdAt: Timestamp.fromMillis(0),
        updatedAt: Timestamp.fromMillis(0),
      });
      await batch.commit();

      await test.expect(getDocs(col)).resolves.toEqual([
        {
          id: "base",
          text: "base",
          parentId: "parent",
          prevId: "newNode",
          nextId: "",
          aboveId: "newNode",
          belowId: "",
          createdAt: timestampForCreatedAt,
          updatedAt: timestampForServerTimestamp,
        },
        {
          id: "newNode",
          text: "newNode",
          parentId: "parent",
          prevId: "",
          nextId: "base",
          aboveId: "parent",
          belowId: "base",
          createdAt: timestampForServerTimestamp,
          updatedAt: timestampForServerTimestamp,
        },
        {
          id: "parent",
          text: "parent",
          parentId: "",
          prevId: "",
          nextId: "",
          aboveId: "",
          belowId: "newNode",
          createdAt: timestampForCreatedAt,
          updatedAt: timestampForServerTimestamp,
        },
      ]);
    });

    test("new node, has prev node", async (test) => {
      const now = new Date();
      const tid = `${test.task.id}_${now.getTime()}`;

      const col = collection(firestoreForTest, tid) as CollectionReference<TreeNodeWithText>;

      await setDocs(col, makeTreeNodes("parent", [["prev"], ["base"]]));

      const batch = writeBatch(firestoreForTest);
      await addPrevSibling(serviceForTest, batch, col, await getDoc(col, "base"), {
        id: "newNode",
        text: "newNode",
        parentId: "",
        prevId: "",
        nextId: "",
        aboveId: "",
        belowId: "",
        createdAt: Timestamp.fromMillis(0),
        updatedAt: Timestamp.fromMillis(0),
      });
      await batch.commit();

      await test.expect(getDocs(col)).resolves.toEqual([
        {
          id: "base",
          text: "base",
          parentId: "parent",
          prevId: "newNode",
          nextId: "",
          aboveId: "newNode",
          belowId: "",
          createdAt: timestampForCreatedAt,
          updatedAt: timestampForServerTimestamp,
        },
        {
          id: "newNode",
          text: "newNode",
          parentId: "parent",
          prevId: "prev",
          nextId: "base",
          aboveId: "prev",
          belowId: "base",
          createdAt: timestampForServerTimestamp,
          updatedAt: timestampForServerTimestamp,
        },
        {
          id: "prev",
          text: "prev",
          parentId: "parent",
          prevId: "",
          nextId: "newNode",
          aboveId: "parent",
          belowId: "newNode",
          createdAt: timestampForCreatedAt,
          updatedAt: timestampForServerTimestamp,
        },
      ]);
    });

    test("new node, has child of prev node", async (test) => {
      const now = new Date();
      const tid = `${test.task.id}_${now.getTime()}`;

      const col = collection(firestoreForTest, tid) as CollectionReference<TreeNodeWithText>;

      await setDocs(col, makeTreeNodes("parent", [["prev", [["child of prev"]]], ["base"]]));

      const batch = writeBatch(firestoreForTest);
      await addPrevSibling(serviceForTest, batch, col, await getDoc(col, "base"), {
        id: "newNode",
        text: "newNode",
        parentId: "",
        prevId: "",
        nextId: "",
        aboveId: "",
        belowId: "",
        createdAt: Timestamp.fromMillis(0),
        updatedAt: Timestamp.fromMillis(0),
      });
      await batch.commit();

      await test.expect(getDocs(col)).resolves.toEqual([
        {
          id: "base",
          text: "base",
          parentId: "parent",
          prevId: "newNode",
          nextId: "",
          aboveId: "newNode",
          belowId: "",
          createdAt: timestampForCreatedAt,
          updatedAt: timestampForServerTimestamp,
        },
        {
          id: "child of prev",
          text: "child of prev",
          parentId: "prev",
          prevId: "",
          nextId: "",
          aboveId: "prev",
          belowId: "newNode",
          createdAt: timestampForCreatedAt,
          updatedAt: timestampForServerTimestamp,
        },
        {
          id: "newNode",
          text: "newNode",
          parentId: "parent",
          prevId: "prev",
          nextId: "base",
          aboveId: "child of prev",
          belowId: "base",
          createdAt: timestampForServerTimestamp,
          updatedAt: timestampForServerTimestamp,
        },
        {
          id: "prev",
          text: "prev",
          parentId: "parent",
          prevId: "",
          nextId: "newNode",
          aboveId: "parent",
          belowId: "child of prev",
          createdAt: timestampForCreatedAt,
          updatedAt: timestampForServerTimestamp,
        },
      ]);
    });

    test("existing node, no prev node", async (test) => {
      const now = new Date();
      const tid = `${test.task.id}_${now.getTime()}`;

      const col = collection(firestoreForTest, tid) as CollectionReference<TreeNodeWithText>;

      await setDocs(col, makeTreeNode("", ["parent", [["base"]]]));
      await setDocs(col, makeTreeNode("", ["addingNode"]));

      const batch = writeBatch(firestoreForTest);
      await addPrevSibling(serviceForTest, batch, col, await getDoc(col, "base"), await getDoc(col, "addingNode"));
      await batch.commit();

      await test.expect(getDocs(col)).resolves.toEqual([
        {
          id: "addingNode",
          text: "addingNode",
          parentId: "parent",
          prevId: "",
          nextId: "base",
          aboveId: "parent",
          belowId: "base",
          createdAt: timestampForCreatedAt,
          updatedAt: timestampForServerTimestamp,
        },
        {
          id: "base",
          text: "base",
          parentId: "parent",
          prevId: "addingNode",
          nextId: "",
          aboveId: "addingNode",
          belowId: "",
          createdAt: timestampForCreatedAt,
          updatedAt: timestampForServerTimestamp,
        },
        {
          id: "parent",
          text: "parent",
          parentId: "",
          prevId: "",
          nextId: "",
          aboveId: "",
          belowId: "addingNode",
          createdAt: timestampForCreatedAt,
          updatedAt: timestampForServerTimestamp,
        },
      ]);
    });

    test("existing node, has prev node", async (test) => {
      const now = new Date();
      const tid = `${test.task.id}_${now.getTime()}`;

      const col = collection(firestoreForTest, tid) as CollectionReference<TreeNodeWithText>;

      await setDocs(col, makeTreeNodes("parent", [["prev"], ["base"]]));
      await setDocs(col, makeTreeNode("", ["addingNode"]));

      const batch = writeBatch(firestoreForTest);
      await addPrevSibling(serviceForTest, batch, col, await getDoc(col, "base"), await getDoc(col, "addingNode"));
      await batch.commit();

      await test.expect(getDocs(col)).resolves.toEqual([
        {
          id: "addingNode",
          text: "addingNode",
          parentId: "parent",
          prevId: "prev",
          nextId: "base",
          aboveId: "prev",
          belowId: "base",
          createdAt: timestampForCreatedAt,
          updatedAt: timestampForServerTimestamp,
        },
        {
          id: "base",
          text: "base",
          parentId: "parent",
          prevId: "addingNode",
          nextId: "",
          aboveId: "addingNode",
          belowId: "",
          createdAt: timestampForCreatedAt,
          updatedAt: timestampForServerTimestamp,
        },
        {
          id: "prev",
          text: "prev",
          parentId: "parent",
          prevId: "",
          nextId: "addingNode",
          aboveId: "parent",
          belowId: "addingNode",
          createdAt: timestampForCreatedAt,
          updatedAt: timestampForServerTimestamp,
        },
      ]);
    });

    test("existing node, has child of prev node", async (test) => {
      const now = new Date();
      const tid = `${test.task.id}_${now.getTime()}`;

      const col = collection(firestoreForTest, tid) as CollectionReference<TreeNodeWithText>;

      await setDocs(col, makeTreeNodes("parent", [["prev", [["child of prev"]]], ["base"]]));
      await setDocs(col, makeTreeNode("", ["addingNode"]));

      const batch = writeBatch(firestoreForTest);
      await addPrevSibling(serviceForTest, batch, col, await getDoc(col, "base"), await getDoc(col, "addingNode"));
      await batch.commit();

      await test.expect(getDocs(col)).resolves.toEqual([
        {
          id: "addingNode",
          text: "addingNode",
          parentId: "parent",
          prevId: "prev",
          nextId: "base",
          aboveId: "child of prev",
          belowId: "base",
          createdAt: timestampForCreatedAt,
          updatedAt: timestampForServerTimestamp,
        },
        {
          id: "base",
          text: "base",
          parentId: "parent",
          prevId: "addingNode",
          nextId: "",
          aboveId: "addingNode",
          belowId: "",
          createdAt: timestampForCreatedAt,
          updatedAt: timestampForServerTimestamp,
        },
        {
          id: "child of prev",
          text: "child of prev",
          parentId: "prev",
          prevId: "",
          nextId: "",
          aboveId: "prev",
          belowId: "addingNode",
          createdAt: timestampForCreatedAt,
          updatedAt: timestampForServerTimestamp,
        },
        {
          id: "prev",
          text: "prev",
          parentId: "parent",
          prevId: "",
          nextId: "addingNode",
          aboveId: "parent",
          belowId: "child of prev",
          createdAt: timestampForCreatedAt,
          updatedAt: timestampForServerTimestamp,
        },
      ]);
    });
  });

  describe("addNextSibling", () => {
    test("new node, no next node", async (test) => {
      const now = new Date();
      const tid = `${test.task.id}_${now.getTime()}`;

      const col = collection(firestoreForTest, tid) as CollectionReference<TreeNodeWithText>;

      await setDocs(col, makeTreeNode("parent", ["base"]));

      const batch = writeBatch(firestoreForTest);
      await addNextSibling(serviceForTest, batch, col, await getDoc(col, "base"), {
        id: "newNode",
        text: "newNode",
        parentId: "",
        prevId: "",
        nextId: "",
        aboveId: "",
        belowId: "",
        createdAt: Timestamp.fromMillis(0),
        updatedAt: Timestamp.fromMillis(0),
      });
      await batch.commit();

      await test.expect(getDocs(col)).resolves.toEqual([
        {
          id: "base",
          text: "base",
          parentId: "parent",
          prevId: "",
          nextId: "newNode",
          aboveId: "parent",
          belowId: "newNode",
          createdAt: timestampForCreatedAt,
          updatedAt: timestampForServerTimestamp,
        },
        {
          id: "newNode",
          text: "newNode",
          parentId: "parent",
          prevId: "base",
          nextId: "",
          aboveId: "base",
          belowId: "",
          createdAt: timestampForServerTimestamp,
          updatedAt: timestampForServerTimestamp,
        },
      ]);
    });

    test("new node, has next node", async (test) => {
      const now = new Date();
      const tid = `${test.task.id}_${now.getTime()}`;

      const col = collection(firestoreForTest, tid) as CollectionReference<TreeNodeWithText>;

      await setDocs(col, makeTreeNodes("parent", [["base"], ["next"]]));

      const batch = writeBatch(firestoreForTest);
      await addNextSibling(serviceForTest, batch, col, await getDoc(col, "base"), {
        id: "newNode",
        text: "newNode",
        parentId: "",
        prevId: "",
        nextId: "",
        aboveId: "",
        belowId: "",
        createdAt: Timestamp.fromMillis(0),
        updatedAt: Timestamp.fromMillis(0),
      });
      await batch.commit();

      await test.expect(getDocs(col)).resolves.toEqual([
        {
          id: "base",
          text: "base",
          parentId: "parent",
          prevId: "",
          nextId: "newNode",
          aboveId: "parent",
          belowId: "newNode",
          createdAt: timestampForCreatedAt,
          updatedAt: timestampForServerTimestamp,
        },
        {
          id: "newNode",
          text: "newNode",
          parentId: "parent",
          prevId: "base",
          nextId: "next",
          aboveId: "base",
          belowId: "next",
          createdAt: timestampForServerTimestamp,
          updatedAt: timestampForServerTimestamp,
        },
        {
          id: "next",
          text: "next",
          parentId: "parent",
          prevId: "newNode",
          nextId: "",
          aboveId: "newNode",
          belowId: "",
          createdAt: timestampForCreatedAt,
          updatedAt: timestampForServerTimestamp,
        },
      ]);
    });

    test("new node, has next node, has child of base node", async (test) => {
      const now = new Date();
      const tid = `${test.task.id}_${now.getTime()}`;

      const col = collection(firestoreForTest, tid) as CollectionReference<TreeNodeWithText>;

      await setDocs(col, makeTreeNodes("parent", [["base", [["child of base"]]], ["next"]]));

      const batch = writeBatch(firestoreForTest);
      await addNextSibling(serviceForTest, batch, col, await getDoc(col, "base"), {
        id: "newNode",
        text: "newNode",
        parentId: "",
        prevId: "",
        nextId: "",
        aboveId: "",
        belowId: "",
        createdAt: Timestamp.fromMillis(0),
        updatedAt: Timestamp.fromMillis(0),
      });
      await batch.commit();

      await test.expect(getDocs(col)).resolves.toEqual([
        {
          id: "base",
          text: "base",
          parentId: "parent",
          prevId: "",
          nextId: "newNode",
          aboveId: "parent",
          belowId: "child of base",
          createdAt: timestampForCreatedAt,
          updatedAt: timestampForServerTimestamp,
        },
        {
          id: "child of base",
          text: "child of base",
          parentId: "base",
          prevId: "",
          nextId: "",
          aboveId: "base",
          belowId: "newNode",
          createdAt: timestampForCreatedAt,
          updatedAt: timestampForServerTimestamp,
        },
        {
          id: "newNode",
          text: "newNode",
          parentId: "parent",
          prevId: "base",
          nextId: "next",
          aboveId: "child of base",
          belowId: "next",
          createdAt: timestampForServerTimestamp,
          updatedAt: timestampForServerTimestamp,
        },
        {
          id: "next",
          text: "next",
          parentId: "parent",
          prevId: "newNode",
          nextId: "",
          aboveId: "newNode",
          belowId: "",
          createdAt: timestampForCreatedAt,
          updatedAt: timestampForServerTimestamp,
        },
      ]);
    });

    test("existing node, no next node", async (test) => {
      const now = new Date();
      const tid = `${test.task.id}_${now.getTime()}`;

      const col = collection(firestoreForTest, tid) as CollectionReference<TreeNodeWithText>;

      await setDocs(col, makeTreeNode("parent", ["base"]));
      await setDocs(col, makeTreeNode("", ["addingNode"]));

      const batch = writeBatch(firestoreForTest);
      await addNextSibling(serviceForTest, batch, col, await getDoc(col, "base"), await getDoc(col, "addingNode"));
      await batch.commit();

      await test.expect(getDocs(col)).resolves.toEqual([
        {
          id: "addingNode",
          text: "addingNode",
          parentId: "parent",
          prevId: "base",
          nextId: "",
          aboveId: "base",
          belowId: "",
          createdAt: timestampForCreatedAt,
          updatedAt: timestampForServerTimestamp,
        },
        {
          id: "base",
          text: "base",
          parentId: "parent",
          prevId: "",
          nextId: "addingNode",
          aboveId: "parent",
          belowId: "addingNode",
          createdAt: timestampForCreatedAt,
          updatedAt: timestampForServerTimestamp,
        },
      ]);
    });

    test("existing node, has next node", async (test) => {
      const now = new Date();
      const tid = `${test.task.id}_${now.getTime()}`;

      const col = collection(firestoreForTest, tid) as CollectionReference<TreeNodeWithText>;

      await setDocs(col, makeTreeNodes("parent", [["base"], ["next"]]));
      await setDocs(col, makeTreeNodes("", [["addingNode"]]));

      const batch = writeBatch(firestoreForTest);
      await addNextSibling(serviceForTest, batch, col, await getDoc(col, "base"), await getDoc(col, "addingNode"));
      await batch.commit();

      await test.expect(getDocs(col)).resolves.toEqual([
        {
          id: "addingNode",
          text: "addingNode",
          parentId: "parent",
          prevId: "base",
          nextId: "next",
          aboveId: "base",
          belowId: "next",
          createdAt: timestampForCreatedAt,
          updatedAt: timestampForServerTimestamp,
        },
        {
          id: "base",
          text: "base",
          parentId: "parent",
          prevId: "",
          nextId: "addingNode",
          aboveId: "parent",
          belowId: "addingNode",
          createdAt: timestampForCreatedAt,
          updatedAt: timestampForServerTimestamp,
        },
        {
          id: "next",
          text: "next",
          parentId: "parent",
          prevId: "addingNode",
          nextId: "",
          aboveId: "addingNode",
          belowId: "",
          createdAt: timestampForCreatedAt,
          updatedAt: timestampForServerTimestamp,
        },
      ]);
    });

    test("existing node, has next node, has child of base node", async (test) => {
      const now = new Date();
      const tid = `${test.task.id}_${now.getTime()}`;

      const col = collection(firestoreForTest, tid) as CollectionReference<TreeNodeWithText>;

      await setDocs(col, makeTreeNodes("parent", [["base", [["child of base"]]], ["next"]]));
      await setDocs(col, makeTreeNodes("", [["addingNode"]]));

      const batch = writeBatch(firestoreForTest);
      await addNextSibling(serviceForTest, batch, col, await getDoc(col, "base"), await getDoc(col, "addingNode"));
      await batch.commit();

      await test.expect(getDocs(col)).resolves.toEqual([
        {
          id: "addingNode",
          text: "addingNode",
          parentId: "parent",
          prevId: "base",
          nextId: "next",
          aboveId: "child of base",
          belowId: "next",
          createdAt: timestampForCreatedAt,
          updatedAt: timestampForServerTimestamp,
        },
        {
          id: "base",
          text: "base",
          parentId: "parent",
          prevId: "",
          nextId: "addingNode",
          aboveId: "parent",
          belowId: "child of base",
          createdAt: timestampForCreatedAt,
          updatedAt: timestampForServerTimestamp,
        },
        {
          id: "child of base",
          text: "child of base",
          parentId: "base",
          prevId: "",
          nextId: "",
          aboveId: "base",
          belowId: "addingNode",
          createdAt: timestampForCreatedAt,
          updatedAt: timestampForServerTimestamp,
        },
        {
          id: "next",
          text: "next",
          parentId: "parent",
          prevId: "addingNode",
          nextId: "",
          aboveId: "addingNode",
          belowId: "",
          createdAt: timestampForCreatedAt,
          updatedAt: timestampForServerTimestamp,
        },
      ]);
    });
  });

  describe("indent", () => {
    test("no prev node", async (test) => {
      const now = new Date();
      const tid = `${test.task.id}_${now.getTime()}`;

      const col = collection(firestoreForTest, tid) as CollectionReference<TreeNodeWithText>;

      await setDocs(col, makeTreeNode("parent", ["node"]));

      const batch = writeBatch(firestoreForTest);
      await indent(serviceForTest, batch, col, await getDoc(col, "node"));
      await batch.commit();

      await test.expect(getDocs(col)).resolves.toEqual([
        {
          id: "node",
          text: "node",
          parentId: "parent",
          prevId: "",
          nextId: "",
          aboveId: "parent",
          belowId: "",
          createdAt: timestampForCreatedAt,
          updatedAt: timestampForCreatedAt,
        },
      ]);
    });

    test("has prev node, has next node, no children nodes of prev node", async (test) => {
      const now = new Date();
      const tid = `${test.task.id}_${now.getTime()}`;

      const col = collection(firestoreForTest, tid) as CollectionReference<TreeNodeWithText>;

      await setDocs(col, makeTreeNodes("parent", [["prev"], ["node"], ["next"]]));

      const batch = writeBatch(firestoreForTest);
      await indent(serviceForTest, batch, col, await getDoc(col, "node"));
      await batch.commit();

      await test.expect(getDocs(col)).resolves.toEqual([
        {
          id: "next",
          text: "next",
          parentId: "parent",
          prevId: "prev",
          nextId: "",
          aboveId: "node",
          belowId: "",
          createdAt: timestampForCreatedAt,
          updatedAt: timestampForServerTimestamp,
        },
        {
          id: "node",
          text: "node",
          parentId: "prev",
          prevId: "",
          nextId: "",
          aboveId: "prev",
          belowId: "next",
          createdAt: timestampForCreatedAt,
          updatedAt: timestampForServerTimestamp,
        },
        {
          id: "prev",
          text: "prev",
          parentId: "parent",
          prevId: "",
          nextId: "next",
          aboveId: "parent",
          belowId: "node",
          createdAt: timestampForCreatedAt,
          updatedAt: timestampForServerTimestamp,
        },
      ]);
    });

    test("has prev node, has next node, has child node, no children nodes of prev node", async (test) => {
      const now = new Date();
      const tid = `${test.task.id}_${now.getTime()}`;

      const col = collection(firestoreForTest, tid) as CollectionReference<TreeNodeWithText>;

      // prettier-ignore
      await setDocs(col, makeTreeNodes("parent", [
        ["prev"],
        ["node", [
          ["child"]
        ]],
        ["next"]
      ]));

      const batch = writeBatch(firestoreForTest);
      await indent(serviceForTest, batch, col, await getDoc(col, "node"));
      await batch.commit();

      await test.expect(getDocs(col)).resolves.toEqual([
        {
          id: "child",
          text: "child",
          parentId: "node",
          prevId: "",
          nextId: "",
          aboveId: "node",
          belowId: "next",
          createdAt: timestampForCreatedAt,
          updatedAt: timestampForServerTimestamp,
        },
        {
          id: "next",
          text: "next",
          parentId: "parent",
          prevId: "prev",
          nextId: "",
          aboveId: "child",
          belowId: "",
          createdAt: timestampForCreatedAt,
          updatedAt: timestampForServerTimestamp,
        },
        {
          id: "node",
          text: "node",
          parentId: "prev",
          prevId: "",
          nextId: "",
          aboveId: "prev",
          belowId: "child",
          createdAt: timestampForCreatedAt,
          updatedAt: timestampForServerTimestamp,
        },
        {
          id: "prev",
          text: "prev",
          parentId: "parent",
          prevId: "",
          nextId: "next",
          aboveId: "parent",
          belowId: "node",
          createdAt: timestampForCreatedAt,
          updatedAt: timestampForServerTimestamp,
        },
      ]);
    });

    test("has prev node, has next node, has children nodes of prev node", async (test) => {
      const now = new Date();
      const tid = `${test.task.id}_${now.getTime()}`;

      const col = collection(firestoreForTest, tid) as CollectionReference<TreeNodeWithText>;
      // prettier-ignore
      await setDocs(col, makeTreeNodes("parent", [
        ["prev", [
          ["first child of prev"],
          ["middle child of prev"],
          ["last child of prev"],
        ]],
        ["node"],
        ["next"],
      ]));

      const batch = writeBatch(firestoreForTest);
      await indent(serviceForTest, batch, col, await getDoc(col, "node"));
      await batch.commit();

      await test.expect(getDocs(col)).resolves.toEqual([
        {
          id: "first child of prev",
          text: "first child of prev",
          parentId: "prev",
          prevId: "",
          nextId: "middle child of prev",
          aboveId: "prev",
          belowId: "middle child of prev",
          createdAt: timestampForCreatedAt,
          updatedAt: timestampForCreatedAt,
        },
        {
          id: "last child of prev",
          text: "last child of prev",
          parentId: "prev",
          prevId: "middle child of prev",
          nextId: "node",
          aboveId: "middle child of prev",
          belowId: "node",
          createdAt: timestampForCreatedAt,
          updatedAt: timestampForServerTimestamp,
        },
        {
          id: "middle child of prev",
          text: "middle child of prev",
          parentId: "prev",
          prevId: "first child of prev",
          nextId: "last child of prev",
          aboveId: "first child of prev",
          belowId: "last child of prev",
          createdAt: timestampForCreatedAt,
          updatedAt: timestampForCreatedAt,
        },
        {
          id: "next",
          text: "next",
          parentId: "parent",
          prevId: "prev",
          nextId: "",
          aboveId: "node",
          belowId: "",
          createdAt: timestampForCreatedAt,
          updatedAt: timestampForServerTimestamp,
        },
        {
          id: "node",
          text: "node",
          parentId: "prev",
          prevId: "last child of prev",
          nextId: "",
          aboveId: "last child of prev",
          belowId: "next",
          createdAt: timestampForCreatedAt,
          updatedAt: timestampForServerTimestamp,
        },
        {
          id: "prev",
          text: "prev",
          parentId: "parent",
          prevId: "",
          nextId: "next",
          aboveId: "parent",
          belowId: "first child of prev",
          createdAt: timestampForCreatedAt,
          updatedAt: timestampForServerTimestamp,
        },
      ]);
    });

    test("has prev node, has next node, has child node, has children nodes of prev node", async (test) => {
      const now = new Date();
      const tid = `${test.task.id}_${now.getTime()}`;

      const col = collection(firestoreForTest, tid) as CollectionReference<TreeNodeWithText>;
      // prettier-ignore
      await setDocs(col, makeTreeNodes("parent", [
        ["prev", [
          ["first child of prev"],
          ["middle child of prev"],
          ["last child of prev"],
        ]],
        ["node", [
          ["child"]
        ]],
        ["next"],
      ]));

      const batch = writeBatch(firestoreForTest);
      await indent(serviceForTest, batch, col, await getDoc(col, "node"));
      await batch.commit();

      await test.expect(getDocs(col)).resolves.toEqual([
        {
          id: "child",
          text: "child",
          parentId: "node",
          prevId: "",
          nextId: "",
          aboveId: "node",
          belowId: "next",
          createdAt: timestampForCreatedAt,
          updatedAt: timestampForServerTimestamp,
        },
        {
          id: "first child of prev",
          text: "first child of prev",
          parentId: "prev",
          prevId: "",
          nextId: "middle child of prev",
          aboveId: "prev",
          belowId: "middle child of prev",
          createdAt: timestampForCreatedAt,
          updatedAt: timestampForCreatedAt,
        },
        {
          id: "last child of prev",
          text: "last child of prev",
          parentId: "prev",
          prevId: "middle child of prev",
          nextId: "node",
          aboveId: "middle child of prev",
          belowId: "node",
          createdAt: timestampForCreatedAt,
          updatedAt: timestampForServerTimestamp,
        },
        {
          id: "middle child of prev",
          text: "middle child of prev",
          parentId: "prev",
          prevId: "first child of prev",
          nextId: "last child of prev",
          aboveId: "first child of prev",
          belowId: "last child of prev",
          createdAt: timestampForCreatedAt,
          updatedAt: timestampForCreatedAt,
        },
        {
          id: "next",
          text: "next",
          parentId: "parent",
          prevId: "prev",
          nextId: "",
          aboveId: "child",
          belowId: "",
          createdAt: timestampForCreatedAt,
          updatedAt: timestampForServerTimestamp,
        },
        {
          id: "node",
          text: "node",
          parentId: "prev",
          prevId: "last child of prev",
          nextId: "",
          aboveId: "last child of prev",
          belowId: "child",
          createdAt: timestampForCreatedAt,
          updatedAt: timestampForServerTimestamp,
        },
        {
          id: "prev",
          text: "prev",
          parentId: "parent",
          prevId: "",
          nextId: "next",
          aboveId: "parent",
          belowId: "first child of prev",
          createdAt: timestampForCreatedAt,
          updatedAt: timestampForServerTimestamp,
        },
      ]);
    });

    test("has prev node, has next node, has children nodes of prev node, has grandchild node of prev node ", async (test) => {
      const now = new Date();
      const tid = `${test.task.id}_${now.getTime()}`;

      const col = collection(firestoreForTest, tid) as CollectionReference<TreeNodeWithText>;
      // prettier-ignore
      await setDocs(col, makeTreeNodes("parent", [
        ["prev", [
          ["first child of prev"],
          ["middle child of prev"],
          ["last child of prev", [
            ["child of last child of prev"]
          ]],
        ]],
        ["node"],
        ["next"],
      ]));

      const batch = writeBatch(firestoreForTest);
      await indent(serviceForTest, batch, col, await getDoc(col, "node"));
      await batch.commit();

      await test.expect(getDocs(col)).resolves.toEqual([
        {
          id: "child of last child of prev",
          text: "child of last child of prev",
          parentId: "last child of prev",
          prevId: "",
          nextId: "",
          aboveId: "last child of prev",
          belowId: "node",
          createdAt: timestampForCreatedAt,
          updatedAt: timestampForServerTimestamp,
        },
        {
          id: "first child of prev",
          text: "first child of prev",
          parentId: "prev",
          prevId: "",
          nextId: "middle child of prev",
          aboveId: "prev",
          belowId: "middle child of prev",
          createdAt: timestampForCreatedAt,
          updatedAt: timestampForCreatedAt,
        },
        {
          id: "last child of prev",
          text: "last child of prev",
          parentId: "prev",
          prevId: "middle child of prev",
          nextId: "node",
          aboveId: "middle child of prev",
          belowId: "child of last child of prev",
          createdAt: timestampForCreatedAt,
          updatedAt: timestampForServerTimestamp,
        },
        {
          id: "middle child of prev",
          text: "middle child of prev",
          parentId: "prev",
          prevId: "first child of prev",
          nextId: "last child of prev",
          aboveId: "first child of prev",
          belowId: "last child of prev",
          createdAt: timestampForCreatedAt,
          updatedAt: timestampForCreatedAt,
        },
        {
          id: "next",
          text: "next",
          parentId: "parent",
          prevId: "prev",
          nextId: "",
          aboveId: "node",
          belowId: "",
          createdAt: timestampForCreatedAt,
          updatedAt: timestampForServerTimestamp,
        },
        {
          id: "node",
          text: "node",
          parentId: "prev",
          prevId: "last child of prev",
          nextId: "",
          aboveId: "child of last child of prev",
          belowId: "next",
          createdAt: timestampForCreatedAt,
          updatedAt: timestampForServerTimestamp,
        },
        {
          id: "prev",
          text: "prev",
          parentId: "parent",
          prevId: "",
          nextId: "next",
          aboveId: "parent",
          belowId: "first child of prev",
          createdAt: timestampForCreatedAt,
          updatedAt: timestampForServerTimestamp,
        },
      ]);
    });

    test("has parent node, has next node, has child node, no children nodes of prev node", async (test) => {
      const now = new Date();
      const tid = `${test.task.id}_${now.getTime()}`;

      const col = collection(firestoreForTest, tid) as CollectionReference<TreeNodeWithText>;

      // prettier-ignore
      await setDocs(col, makeTreeNodes("grandparent", [
        ["parent", [
          ["prev"],
          ["node"],
        ]],
        ["next of parent"]
      ]));

      const batch = writeBatch(firestoreForTest);
      await indent(serviceForTest, batch, col, await getDoc(col, "node"));
      await batch.commit();

      await test.expect(getDocs(col)).resolves.toEqual([
        {
          id: "next of parent",
          text: "next of parent",
          parentId: "grandparent",
          prevId: "parent",
          nextId: "",
          aboveId: "node",
          belowId: "",
          createdAt: timestampForCreatedAt,
          updatedAt: timestampForServerTimestamp,
        },
        {
          id: "node",
          text: "node",
          parentId: "prev",
          prevId: "",
          nextId: "",
          aboveId: "prev",
          belowId: "next of parent",
          createdAt: timestampForCreatedAt,
          updatedAt: timestampForServerTimestamp,
        },
        {
          id: "parent",
          text: "parent",
          parentId: "grandparent",
          prevId: "",
          nextId: "next of parent",
          aboveId: "grandparent",
          belowId: "prev",
          createdAt: timestampForCreatedAt,
          updatedAt: timestampForCreatedAt,
        },
        {
          id: "prev",
          text: "prev",
          parentId: "parent",
          prevId: "",
          nextId: "",
          aboveId: "parent",
          belowId: "node",
          createdAt: timestampForCreatedAt,
          updatedAt: timestampForServerTimestamp,
        },
      ]);
    });
  });

  describe("dedent", () => {
    test("no parent node", async (test) => {
      const now = new Date();
      const tid = `${test.task.id}_${now.getTime()}`;

      const col = collection(firestoreForTest, tid) as CollectionReference<TreeNodeWithText>;

      await setDocs(col, makeTreeNode("parent", ["node"]));

      const batch = writeBatch(firestoreForTest);
      await dedent(serviceForTest, batch, col, await getDoc(col, "node"));
      await batch.commit();

      await test.expect(getDocs(col)).resolves.toEqual([
        {
          id: "node",
          text: "node",
          parentId: "parent",
          prevId: "",
          nextId: "",
          aboveId: "parent",
          belowId: "",
          createdAt: timestampForCreatedAt,
          updatedAt: timestampForCreatedAt,
        },
      ]);
    });

    test("has parent node, no next node of parent node", async (test) => {
      const now = new Date();
      const tid = `${test.task.id}_${now.getTime()}`;

      const col = collection(firestoreForTest, tid) as CollectionReference<TreeNodeWithText>;

      await setDocs(col, makeTreeNode("grandparent", ["parent", [["node"]]]));

      const batch = writeBatch(firestoreForTest);
      await dedent(serviceForTest, batch, col, await getDoc(col, "node"));
      await batch.commit();

      await test.expect(getDocs(col)).resolves.toEqual([
        {
          id: "node",
          text: "node",
          parentId: "grandparent",
          prevId: "parent",
          nextId: "",
          aboveId: "parent",
          belowId: "",
          createdAt: timestampForCreatedAt,
          updatedAt: timestampForServerTimestamp,
        },
        {
          id: "parent",
          text: "parent",
          parentId: "grandparent",
          prevId: "",
          nextId: "node",
          aboveId: "grandparent",
          belowId: "node",
          createdAt: timestampForCreatedAt,
          updatedAt: timestampForServerTimestamp,
        },
      ]);
    });

    test("has parent node, has next node of parent node", async (test) => {
      const now = new Date();
      const tid = `${test.task.id}_${now.getTime()}`;

      const col = collection(firestoreForTest, tid) as CollectionReference<TreeNodeWithText>;

      // prettier-ignore
      await setDocs(col, makeTreeNodes("grandparent", [
        ["parent", [
          ["node"],
        ]],
        ["next of parent"],
      ]));

      const batch = writeBatch(firestoreForTest);
      await dedent(serviceForTest, batch, col, await getDoc(col, "node"));
      await batch.commit();

      await test.expect(getDocs(col)).resolves.toEqual([
        {
          id: "next of parent",
          text: "next of parent",
          parentId: "grandparent",
          prevId: "node",
          nextId: "",
          aboveId: "node",
          belowId: "",
          createdAt: timestampForCreatedAt,
          updatedAt: timestampForServerTimestamp,
        },
        {
          id: "node",
          text: "node",
          parentId: "grandparent",
          prevId: "parent",
          nextId: "next of parent",
          aboveId: "parent",
          belowId: "next of parent",
          createdAt: timestampForCreatedAt,
          updatedAt: timestampForServerTimestamp,
        },
        {
          id: "parent",
          text: "parent",
          parentId: "grandparent",
          prevId: "",
          nextId: "node",
          aboveId: "grandparent",
          belowId: "node",
          createdAt: timestampForCreatedAt,
          updatedAt: timestampForServerTimestamp,
        },
      ]);
    });

    test("has parent node, has child node, has prev node, has next node of parent node", async (test) => {
      const now = new Date();
      const tid = `${test.task.id}_${now.getTime()}`;

      const col = collection(firestoreForTest, tid) as CollectionReference<TreeNodeWithText>;

      // prettier-ignore
      await setDocs(col, makeTreeNodes("grandparent", [
        ["parent", [
          ["prev"],
          ["node", [
            ["child"],
          ]],
        ]],
        ["next of parent"],
      ]));

      const batch = writeBatch(firestoreForTest);
      await dedent(serviceForTest, batch, col, await getDoc(col, "node"));
      await batch.commit();

      await test.expect(getDocs(col)).resolves.toEqual([
        {
          id: "child",
          text: "child",
          parentId: "node",
          prevId: "",
          nextId: "",
          aboveId: "node",
          belowId: "next of parent",
          createdAt: timestampForCreatedAt,
          updatedAt: timestampForServerTimestamp,
        },
        {
          id: "next of parent",
          text: "next of parent",
          parentId: "grandparent",
          prevId: "node",
          nextId: "",
          aboveId: "child",
          belowId: "",
          createdAt: timestampForCreatedAt,
          updatedAt: timestampForServerTimestamp,
        },
        {
          id: "node",
          text: "node",
          parentId: "grandparent",
          prevId: "parent",
          nextId: "next of parent",
          aboveId: "prev",
          belowId: "child",
          createdAt: timestampForCreatedAt,
          updatedAt: timestampForServerTimestamp,
        },
        {
          id: "parent",
          text: "parent",
          parentId: "grandparent",
          prevId: "",
          nextId: "node",
          aboveId: "grandparent",
          belowId: "prev",
          createdAt: timestampForCreatedAt,
          updatedAt: timestampForServerTimestamp,
        },
        {
          id: "prev",
          text: "prev",
          parentId: "parent",
          prevId: "",
          nextId: "",
          aboveId: "parent",
          belowId: "node",
          createdAt: timestampForCreatedAt,
          updatedAt: timestampForServerTimestamp,
        },
      ]);
    });

    test("has parent node, has child node, has prev node, has next node, has next node of parent node", async (test) => {
      const now = new Date();
      const tid = `${test.task.id}_${now.getTime()}`;

      const col = collection(firestoreForTest, tid) as CollectionReference<TreeNodeWithText>;

      // prettier-ignore
      await setDocs(col, makeTreeNodes("grandparent", [
        ["parent", [
          ["prev"],
          ["node", [
            ["child"],
          ]],
          ["next"],
        ]],
        ["next of parent"],
      ]));

      const batch = writeBatch(firestoreForTest);
      await dedent(serviceForTest, batch, col, await getDoc(col, "node"));
      await batch.commit();

      await test.expect(getDocs(col)).resolves.toEqual([
        {
          id: "child",
          text: "child",
          parentId: "node",
          prevId: "",
          nextId: "",
          aboveId: "node",
          belowId: "next of parent",
          createdAt: timestampForCreatedAt,
          updatedAt: timestampForServerTimestamp,
        },
        {
          id: "next",
          text: "next",
          parentId: "parent",
          prevId: "prev",
          nextId: "",
          aboveId: "prev",
          belowId: "node",
          createdAt: timestampForCreatedAt,
          updatedAt: timestampForServerTimestamp,
        },
        {
          id: "next of parent",
          text: "next of parent",
          parentId: "grandparent",
          prevId: "node",
          nextId: "",
          aboveId: "child",
          belowId: "",
          createdAt: timestampForCreatedAt,
          updatedAt: timestampForServerTimestamp,
        },
        {
          id: "node",
          text: "node",
          parentId: "grandparent",
          prevId: "parent",
          nextId: "next of parent",
          aboveId: "next",
          belowId: "child",
          createdAt: timestampForCreatedAt,
          updatedAt: timestampForServerTimestamp,
        },
        {
          id: "parent",
          text: "parent",
          parentId: "grandparent",
          prevId: "",
          nextId: "node",
          aboveId: "grandparent",
          belowId: "prev",
          createdAt: timestampForCreatedAt,
          updatedAt: timestampForServerTimestamp,
        },
        {
          id: "prev",
          text: "prev",
          parentId: "parent",
          prevId: "",
          nextId: "next",
          aboveId: "parent",
          belowId: "next",
          createdAt: timestampForCreatedAt,
          updatedAt: timestampForServerTimestamp,
        },
      ]);
    });
  });

  describe("movePrev", () => {
    test("no prev node", async (test) => {
      const now = new Date();
      const tid = `${test.task.id}_${now.getTime()}`;

      const col = collection(firestoreForTest, tid) as CollectionReference<TreeNodeWithText>;

      await setDocs(col, makeTreeNode("parent", ["node"]));

      const batch = writeBatch(firestoreForTest);
      await movePrev(serviceForTest, batch, col, await getDoc(col, "node"));
      await batch.commit();

      await test.expect(getDocs(col)).resolves.toEqual([
        {
          id: "node",
          text: "node",
          parentId: "parent",
          prevId: "",
          nextId: "",
          aboveId: "parent",
          belowId: "",
          createdAt: timestampForCreatedAt,
          updatedAt: timestampForCreatedAt,
        },
      ]);
    });

    test("has prev node, has prev node of prev node", async (test) => {
      const now = new Date();
      const tid = `${test.task.id}_${now.getTime()}`;

      const col = collection(firestoreForTest, tid) as CollectionReference<TreeNodeWithText>;

      await setDocs(col, makeTreeNodes("parent", [["prev of prev"], ["prev"], ["node"]]));

      const batch = writeBatch(firestoreForTest);
      await movePrev(serviceForTest, batch, col, await getDoc(col, "node"));
      await batch.commit();

      await test.expect(getDocs(col)).resolves.toEqual([
        {
          id: "node",
          text: "node",
          parentId: "parent",
          prevId: "prev of prev",
          nextId: "prev",
          aboveId: "prev of prev",
          belowId: "prev",
          createdAt: timestampForCreatedAt,
          updatedAt: timestampForServerTimestamp,
        },
        {
          id: "prev",
          text: "prev",
          parentId: "parent",
          prevId: "node",
          nextId: "",
          aboveId: "node",
          belowId: "",
          createdAt: timestampForCreatedAt,
          updatedAt: timestampForServerTimestamp,
        },
        {
          id: "prev of prev",
          text: "prev of prev",
          parentId: "parent",
          prevId: "",
          nextId: "node",
          aboveId: "parent",
          belowId: "node",
          createdAt: timestampForCreatedAt,
          updatedAt: timestampForServerTimestamp,
        },
      ]);
    });

    test("has prev node, has prev node of prev node, has child", async (test) => {
      const now = new Date();
      const tid = `${test.task.id}_${now.getTime()}`;

      const col = collection(firestoreForTest, tid) as CollectionReference<TreeNodeWithText>;

      await setDocs(col, makeTreeNodes("parent", [["prev of prev"], ["prev"], ["node", [["child"]]]]));

      const batch = writeBatch(firestoreForTest);
      await movePrev(serviceForTest, batch, col, await getDoc(col, "node"));
      await batch.commit();

      await test.expect(getDocs(col)).resolves.toEqual([
        {
          id: "child",
          text: "child",
          parentId: "node",
          prevId: "",
          nextId: "",
          aboveId: "node",
          belowId: "prev",
          createdAt: timestampForCreatedAt,
          updatedAt: timestampForServerTimestamp,
        },
        {
          id: "node",
          text: "node",
          parentId: "parent",
          prevId: "prev of prev",
          nextId: "prev",
          aboveId: "prev of prev",
          belowId: "child",
          createdAt: timestampForCreatedAt,
          updatedAt: timestampForServerTimestamp,
        },
        {
          id: "prev",
          text: "prev",
          parentId: "parent",
          prevId: "node",
          nextId: "",
          aboveId: "child",
          belowId: "",
          createdAt: timestampForCreatedAt,
          updatedAt: timestampForServerTimestamp,
        },
        {
          id: "prev of prev",
          text: "prev of prev",
          parentId: "parent",
          prevId: "",
          nextId: "node",
          aboveId: "parent",
          belowId: "node",
          createdAt: timestampForCreatedAt,
          updatedAt: timestampForServerTimestamp,
        },
      ]);
    });
  });

  describe("moveNext", () => {
    test("no next node", async (test) => {
      const now = new Date();
      const tid = `${test.task.id}_${now.getTime()}`;

      const col = collection(firestoreForTest, tid) as CollectionReference<TreeNodeWithText>;

      await setDocs(col, makeTreeNode("parent", ["node"]));

      const batch = writeBatch(firestoreForTest);
      await movePrev(serviceForTest, batch, col, await getDoc(col, "node"));
      await batch.commit();

      await test.expect(getDocs(col)).resolves.toEqual([
        {
          id: "node",
          text: "node",
          parentId: "parent",
          prevId: "",
          nextId: "",
          aboveId: "parent",
          belowId: "",
          createdAt: timestampForCreatedAt,
          updatedAt: timestampForCreatedAt,
        },
      ]);
    });

    test("has next node, has next node of next node", async (test) => {
      const now = new Date();
      const tid = `${test.task.id}_${now.getTime()}`;

      const col = collection(firestoreForTest, tid) as CollectionReference<TreeNodeWithText>;

      await setDocs(col, makeTreeNode("", ["parent", [["node"], ["next"], ["next of next"]]]));

      const batch = writeBatch(firestoreForTest);
      await moveNext(serviceForTest, batch, col, await getDoc(col, "node"));
      await batch.commit();

      await test.expect(getDocs(col)).resolves.toEqual([
        {
          id: "next",
          text: "next",
          parentId: "parent",
          prevId: "",
          nextId: "node",
          aboveId: "parent",
          belowId: "node",
          createdAt: timestampForCreatedAt,
          updatedAt: timestampForServerTimestamp,
        },
        {
          id: "next of next",
          text: "next of next",
          parentId: "parent",
          prevId: "node",
          nextId: "",
          aboveId: "node",
          belowId: "",
          createdAt: timestampForCreatedAt,
          updatedAt: timestampForServerTimestamp,
        },
        {
          id: "node",
          text: "node",
          parentId: "parent",
          prevId: "next",
          nextId: "next of next",
          aboveId: "next",
          belowId: "next of next",
          createdAt: timestampForCreatedAt,
          updatedAt: timestampForServerTimestamp,
        },
        {
          id: "parent",
          text: "parent",
          parentId: "",
          prevId: "",
          nextId: "",
          aboveId: "",
          belowId: "next",
          createdAt: timestampForCreatedAt,
          updatedAt: timestampForServerTimestamp,
        },
      ]);
    });

    test("has next node, has next node of next node, has child node", async (test) => {
      const now = new Date();
      const tid = `${test.task.id}_${now.getTime()}`;

      const col = collection(firestoreForTest, tid) as CollectionReference<TreeNodeWithText>;

      await setDocs(col, makeTreeNode("", ["parent", [["node", [["child"]]], ["next"], ["next of next"]]]));

      const batch = writeBatch(firestoreForTest);
      await moveNext(serviceForTest, batch, col, await getDoc(col, "node"));
      await batch.commit();

      await test.expect(getDocs(col)).resolves.toEqual([
        {
          id: "child",
          text: "child",
          parentId: "node",
          prevId: "",
          nextId: "",
          aboveId: "node",
          belowId: "next of next",
          createdAt: timestampForCreatedAt,
          updatedAt: timestampForServerTimestamp,
        },
        {
          id: "next",
          text: "next",
          parentId: "parent",
          prevId: "",
          nextId: "node",
          aboveId: "parent",
          belowId: "node",
          createdAt: timestampForCreatedAt,
          updatedAt: timestampForServerTimestamp,
        },
        {
          id: "next of next",
          text: "next of next",
          parentId: "parent",
          prevId: "node",
          nextId: "",
          aboveId: "child",
          belowId: "",
          createdAt: timestampForCreatedAt,
          updatedAt: timestampForServerTimestamp,
        },
        {
          id: "node",
          text: "node",
          parentId: "parent",
          prevId: "next",
          nextId: "next of next",
          aboveId: "next",
          belowId: "child",
          createdAt: timestampForCreatedAt,
          updatedAt: timestampForServerTimestamp,
        },
        {
          id: "parent",
          text: "parent",
          parentId: "",
          prevId: "",
          nextId: "",
          aboveId: "",
          belowId: "next",
          createdAt: timestampForCreatedAt,
          updatedAt: timestampForServerTimestamp,
        },
      ]);
    });
  });

  describe("remove", () => {
    test("has child node", async (test) => {
      const now = new Date();
      const tid = `${test.task.id}_${now.getTime()}`;

      const col = collection(firestoreForTest, tid) as CollectionReference<TreeNodeWithText>;

      await setDocs(col, makeTreeNode("", ["node", [["child"]]]));

      await test.expect(async () => {
        const batch = writeBatch(firestoreForTest);
        await remove(serviceForTest, batch, col, await getDoc(col, "node"));
        await batch.commit();
      }).rejects.toThrowErrorMatchingInlineSnapshot(`
        [Error: cannot delete node with children: {
          "node": {
            "text": "node",
            "parentId": "",
            "prevId": "",
            "nextId": "",
            "aboveId": "",
            "belowId": "child",
            "createdAt": {
              "type": "firestore/timestamp/1.0",
              "seconds": 4836316028,
              "nanoseconds": 0
            },
            "updatedAt": {
              "type": "firestore/timestamp/1.0",
              "seconds": 4836316028,
              "nanoseconds": 0
            },
            "id": "node"
          },
          "firstChildNode": {
            "text": "child",
            "parentId": "node",
            "prevId": "",
            "nextId": "",
            "aboveId": "node",
            "belowId": "",
            "createdAt": {
              "type": "firestore/timestamp/1.0",
              "seconds": 4836316028,
              "nanoseconds": 0
            },
            "updatedAt": {
              "type": "firestore/timestamp/1.0",
              "seconds": 4836316028,
              "nanoseconds": 0
            },
            "id": "child"
          }
        }]
      `);
    });

    test("no prev node, no next node", async (test) => {
      const now = new Date();
      const tid = `${test.task.id}_${now.getTime()}`;

      const col = collection(firestoreForTest, tid) as CollectionReference<TreeNodeWithText>;

      await setDocs(col, makeTreeNode("", ["node"]));

      const batch = writeBatch(firestoreForTest);
      await remove(serviceForTest, batch, col, await getDoc(col, "node"));
      await batch.commit();

      await test.expect(getDocs(col)).resolves.toEqual([]);
    });

    test("has prev node, has next node", async (test) => {
      const now = new Date();
      const tid = `${test.task.id}_${now.getTime()}`;

      const col = collection(firestoreForTest, tid) as CollectionReference<TreeNodeWithText>;

      await setDocs(col, makeTreeNodes("parent", [["prev"], ["node"], ["next"]]));

      const batch = writeBatch(firestoreForTest);
      await remove(serviceForTest, batch, col, await getDoc(col, "node"));
      await batch.commit();

      await test.expect(getDocs(col)).resolves.toEqual([
        {
          id: "next",
          text: "next",
          parentId: "parent",
          prevId: "prev",
          nextId: "",
          aboveId: "prev",
          belowId: "",
          createdAt: timestampForCreatedAt,
          updatedAt: timestampForServerTimestamp,
        },
        {
          id: "prev",
          text: "prev",
          parentId: "parent",
          prevId: "",
          nextId: "next",
          aboveId: "parent",
          belowId: "next",
          createdAt: timestampForCreatedAt,
          updatedAt: timestampForServerTimestamp,
        },
      ]);
    });

    test("has prev node, has next node, has child node of prev node, has child node of next node", async (test) => {
      const now = new Date();
      const tid = `${test.task.id}_${now.getTime()}`;

      const col = collection(firestoreForTest, tid) as CollectionReference<TreeNodeWithText>;

      await setDocs(
        col,
        makeTreeNodes("parent", [["prev", [["child of prev"]]], ["node"], ["next", [["child of next"]]]]),
      );

      const batch = writeBatch(firestoreForTest);
      await remove(serviceForTest, batch, col, await getDoc(col, "node"));
      await batch.commit();

      await test.expect(getDocs(col)).resolves.toEqual([
        {
          id: "child of next",
          text: "child of next",
          parentId: "next",
          prevId: "",
          nextId: "",
          aboveId: "next",
          belowId: "",
          createdAt: timestampForCreatedAt,
          updatedAt: timestampForCreatedAt,
        },
        {
          id: "child of prev",
          text: "child of prev",
          parentId: "prev",
          prevId: "",
          nextId: "",
          aboveId: "prev",
          belowId: "next",
          createdAt: timestampForCreatedAt,
          updatedAt: timestampForServerTimestamp,
        },
        {
          id: "next",
          text: "next",
          parentId: "parent",
          prevId: "prev",
          nextId: "",
          aboveId: "child of prev",
          belowId: "child of next",
          createdAt: timestampForCreatedAt,
          updatedAt: timestampForServerTimestamp,
        },
        {
          id: "prev",
          text: "prev",
          parentId: "parent",
          prevId: "",
          nextId: "next",
          aboveId: "parent",
          belowId: "child of prev",
          createdAt: timestampForCreatedAt,
          updatedAt: timestampForServerTimestamp,
        },
      ]);
    });
  });
});
