import type { TreeNode } from "@/services/firebase/firestore/treeNode";
import type { CollectionReference } from "firebase/firestore";

import { runTransaction, collection, doc, getDoc, getDocs, Timestamp } from "firebase/firestore";
import { describe, test, vi } from "vitest";

import { txGet, getDocumentData } from "@/services/firebase/firestore";
import { setDocs, timestampForCreatedAt, timestampForServerTimestamp } from "@/services/firebase/firestore/test";
import {
  getAboveNode,
  getBelowNode,
  getFirstChildNode,
  getLastChildNode,
  getNextNode,
  getParentNode,
  getPrevNode,
  getBottomNode,
  unlinkFromSiblings,
  addPrevSibling,
  addNextSibling,
  indent,
} from "@/services/firebase/firestore/treeNode";
import { firestoreForTest } from "@/services/firebase/test";

type TreeNodeWithText = TreeNode & { text: string };
type TreeNodeFixture = [string, TreeNodeFixture[]?];

function makeTreeNodes(parentId: string, fixtures: TreeNodeFixture[]): TreeNodeWithText[] {
  const treeNodes = fixtures.map((fixture) => makeTreeNode(parentId, fixture));

  for (let i = 0; i < treeNodes.length; i++) {
    if (i - 1 >= 0) {
      treeNodes[i][0].prevId = treeNodes[i - 1][0].text;
    }

    if (i + 1 < treeNodes.length) {
      treeNodes[i][0].nextId = treeNodes[i + 1][0].text;
    }
  }

  return treeNodes.flat().sort((a, b) => a.text.localeCompare(b.text));
}

function makeTreeNode(parentId: string, [text, children]: TreeNodeFixture): TreeNodeWithText[] {
  return [
    {
      text,
      parentId,
      prevId: "",
      nextId: "",
      createdAt: timestampForCreatedAt,
      updatedAt: timestampForCreatedAt,
    },
    ...makeTreeNodes(text, children ?? []),
  ];
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

      await test
        .expect(runTransaction(firestoreForTest, async (tx) => getPrevNode(tx, col, (await txGet(tx, col, "base"))!)))
        .resolves.toBeUndefined();
    });

    test("prev node exists", async (test) => {
      const now = new Date();
      const tid = `${test.task.id}_${now.getTime()}`;

      const col = collection(firestoreForTest, tid) as CollectionReference<TreeNodeWithText>;

      await setDocs(col, makeTreeNodes("", [["prev"], ["base"]]));

      await test
        .expect(runTransaction(firestoreForTest, async (tx) => getPrevNode(tx, col, (await txGet(tx, col, "base"))!)))
        .resolves.toEqual({
          id: "prev",
          text: "prev",
          prevId: "",
          nextId: "base",
          parentId: "",
          createdAt: timestampForCreatedAt,
          updatedAt: timestampForCreatedAt,
        });
    });

    test("invalid baseNode.prevId", async (test) => {
      const now = new Date();
      const tid = `${test.task.id}_${now.getTime()}`;

      const col = collection(firestoreForTest, tid) as CollectionReference<TreeNodeWithText>;

      await setDocs(col, [
        {
          text: "base",
          prevId: "invalid",
          nextId: "",
          parentId: "",
          createdAt: timestampForCreatedAt,
          updatedAt: timestampForCreatedAt,
        },
      ]);

      await test.expect(() =>
        runTransaction(firestoreForTest, async (tx) => getPrevNode(tx, col, (await txGet(tx, col, "base"))!)),
      ).rejects.toThrowErrorMatchingInlineSnapshot(`
        [Error: previous node of baseNode is not exist: {
          "baseNode": {
            "text": "base",
            "prevId": "invalid",
            "nextId": "",
            "parentId": "",
            "createdAt": {
              "seconds": 4836316028,
              "nanoseconds": 0
            },
            "updatedAt": {
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

      await setDocs(col, [
        {
          text: "prev",
          prevId: "",
          nextId: "invalid",
          parentId: "",
          createdAt: timestampForCreatedAt,
          updatedAt: timestampForCreatedAt,
        },
        {
          text: "base",
          prevId: "prev",
          nextId: "",
          parentId: "",
          createdAt: timestampForCreatedAt,
          updatedAt: timestampForCreatedAt,
        },
      ]);

      await test.expect(() =>
        runTransaction(firestoreForTest, async (tx) => getPrevNode(tx, col, (await txGet(tx, col, "base"))!)),
      ).rejects.toThrowErrorMatchingInlineSnapshot(`
        [Error: next node of previous node of baseNode is not baseNode: {
          "baseNode": {
            "text": "base",
            "prevId": "prev",
            "nextId": "",
            "parentId": "",
            "createdAt": {
              "seconds": 4836316028,
              "nanoseconds": 0
            },
            "updatedAt": {
              "seconds": 4836316028,
              "nanoseconds": 0
            },
            "id": "base"
          },
          "prevNode": {
            "text": "prev",
            "prevId": "",
            "nextId": "invalid",
            "parentId": "",
            "createdAt": {
              "seconds": 4836316028,
              "nanoseconds": 0
            },
            "updatedAt": {
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

      await setDocs(col, [
        {
          text: "prev",
          prevId: "",
          nextId: "base",
          parentId: "foo",
          createdAt: timestampForCreatedAt,
          updatedAt: timestampForCreatedAt,
        },
        {
          text: "base",
          prevId: "prev",
          nextId: "",
          parentId: "bar",
          createdAt: timestampForCreatedAt,
          updatedAt: timestampForCreatedAt,
        },
      ]);

      await test.expect(() =>
        runTransaction(firestoreForTest, async (tx) => getPrevNode(tx, col, (await txGet(tx, col, "base"))!)),
      ).rejects.toThrowErrorMatchingInlineSnapshot(`
        [Error: parent node of previous node of baseNode is not one of baseNode: {
          "baseNode": {
            "text": "base",
            "prevId": "prev",
            "nextId": "",
            "parentId": "bar",
            "createdAt": {
              "seconds": 4836316028,
              "nanoseconds": 0
            },
            "updatedAt": {
              "seconds": 4836316028,
              "nanoseconds": 0
            },
            "id": "base"
          },
          "prevNode": {
            "text": "prev",
            "prevId": "",
            "nextId": "base",
            "parentId": "foo",
            "createdAt": {
              "seconds": 4836316028,
              "nanoseconds": 0
            },
            "updatedAt": {
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

      await test
        .expect(runTransaction(firestoreForTest, async (tx) => getNextNode(tx, col, (await txGet(tx, col, "base"))!)))
        .resolves.toBeUndefined();
    });

    test("next node exists", async (test) => {
      const now = new Date();
      const tid = `${test.task.id}_${now.getTime()}`;

      const col = collection(firestoreForTest, tid) as CollectionReference<TreeNodeWithText>;

      await setDocs(col, makeTreeNodes("", [["base"], ["next"]]));

      await test
        .expect(runTransaction(firestoreForTest, async (tx) => getNextNode(tx, col, (await txGet(tx, col, "base"))!)))
        .resolves.toEqual({
          id: "next",
          text: "next",
          prevId: "base",
          nextId: "",
          parentId: "",
          createdAt: timestampForCreatedAt,
          updatedAt: timestampForCreatedAt,
        });
    });

    test("invalid baseNode.nextId", async (test) => {
      const now = new Date();
      const tid = `${test.task.id}_${now.getTime()}`;

      const col = collection(firestoreForTest, tid) as CollectionReference<TreeNodeWithText>;

      await setDocs(col, [
        {
          text: "base",
          prevId: "",
          nextId: "invalid",
          parentId: "",
          createdAt: timestampForCreatedAt,
          updatedAt: timestampForCreatedAt,
        },
      ]);

      await test.expect(() =>
        runTransaction(firestoreForTest, async (tx) => getNextNode(tx, col, (await txGet(tx, col, "base"))!)),
      ).rejects.toThrowErrorMatchingInlineSnapshot(`
        [Error: next node of baseNode is not exist: {
          "baseNode": {
            "text": "base",
            "prevId": "",
            "nextId": "invalid",
            "parentId": "",
            "createdAt": {
              "seconds": 4836316028,
              "nanoseconds": 0
            },
            "updatedAt": {
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

      await setDocs(col, [
        {
          text: "base",
          prevId: "",
          nextId: "next",
          parentId: "",
          createdAt: timestampForCreatedAt,
          updatedAt: timestampForCreatedAt,
        },
        {
          text: "next",
          prevId: "invalid",
          nextId: "",
          parentId: "",
          createdAt: timestampForCreatedAt,
          updatedAt: timestampForCreatedAt,
        },
      ]);

      await test.expect(() =>
        runTransaction(firestoreForTest, async (tx) => getNextNode(tx, col, (await txGet(tx, col, "base"))!)),
      ).rejects.toThrowErrorMatchingInlineSnapshot(`
        [Error: previous node of next node of baseNode is not baseNode: {
          "baseNode": {
            "text": "base",
            "prevId": "",
            "nextId": "next",
            "parentId": "",
            "createdAt": {
              "seconds": 4836316028,
              "nanoseconds": 0
            },
            "updatedAt": {
              "seconds": 4836316028,
              "nanoseconds": 0
            },
            "id": "base"
          },
          "nextNode": {
            "text": "next",
            "prevId": "invalid",
            "nextId": "",
            "parentId": "",
            "createdAt": {
              "seconds": 4836316028,
              "nanoseconds": 0
            },
            "updatedAt": {
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

      await setDocs(col, [
        {
          text: "base",
          prevId: "",
          nextId: "next",
          parentId: "foo",
          createdAt: timestampForCreatedAt,
          updatedAt: timestampForCreatedAt,
        },
        {
          text: "next",
          prevId: "base",
          nextId: "",
          parentId: "bar",
          createdAt: timestampForCreatedAt,
          updatedAt: timestampForCreatedAt,
        },
      ]);

      await test.expect(() =>
        runTransaction(firestoreForTest, async (tx) => getNextNode(tx, col, (await txGet(tx, col, "base"))!)),
      ).rejects.toThrowErrorMatchingInlineSnapshot(`
        [Error: parent node of next node of baseNode is not one of baseNode: {
          "baseNode": {
            "text": "base",
            "prevId": "",
            "nextId": "next",
            "parentId": "foo",
            "createdAt": {
              "seconds": 4836316028,
              "nanoseconds": 0
            },
            "updatedAt": {
              "seconds": 4836316028,
              "nanoseconds": 0
            },
            "id": "base"
          },
          "nextNode": {
            "text": "next",
            "prevId": "base",
            "nextId": "",
            "parentId": "bar",
            "createdAt": {
              "seconds": 4836316028,
              "nanoseconds": 0
            },
            "updatedAt": {
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

      await test
        .expect(runTransaction(firestoreForTest, async (tx) => getParentNode(tx, col, (await txGet(tx, col, "base"))!)))
        .resolves.toBeUndefined();
    });

    test("parent node exists", async (test) => {
      const now = new Date();
      const tid = `${test.task.id}_${now.getTime()}`;

      const col = collection(firestoreForTest, tid) as CollectionReference<TreeNodeWithText>;

      await setDocs(col, makeTreeNode("", ["parent", [["base"]]]));

      await test
        .expect(runTransaction(firestoreForTest, async (tx) => getParentNode(tx, col, (await txGet(tx, col, "base"))!)))
        .resolves.toEqual({
          id: "parent",
          text: "parent",
          prevId: "",
          nextId: "",
          parentId: "",
          createdAt: timestampForCreatedAt,
          updatedAt: timestampForCreatedAt,
        });
    });

    test("baseNode.parentId refers to a node of another collection", async (test) => {
      const now = new Date();
      const tid = `${test.task.id}_${now.getTime()}`;

      const col = collection(firestoreForTest, tid) as CollectionReference<TreeNodeWithText>;

      await setDocs(col, [
        {
          text: "base",
          prevId: "",
          nextId: "",
          parentId: "another_collection_id",
          createdAt: timestampForCreatedAt,
          updatedAt: timestampForCreatedAt,
        },
      ]);

      await test
        .expect(runTransaction(firestoreForTest, async (tx) => getParentNode(tx, col, (await txGet(tx, col, "base"))!)))
        .resolves.toBeUndefined();
    });
  });

  describe("getFirstChildNode", () => {
    test("no first child node", async (test) => {
      const now = new Date();
      const tid = `${test.task.id}_${now.getTime()}`;

      const col = collection(firestoreForTest, tid) as CollectionReference<TreeNodeWithText>;

      await setDocs(col, makeTreeNode("", ["base"]));

      await test
        .expect(
          runTransaction(firestoreForTest, async (tx) =>
            getFirstChildNode(tx, col, getDocumentData(await getDoc(doc(col, "base")))!),
          ),
        )
        .resolves.toBeUndefined();
    });

    test("first child node exists", async (test) => {
      const now = new Date();
      const tid = `${test.task.id}_${now.getTime()}`;

      const col = collection(firestoreForTest, tid) as CollectionReference<TreeNodeWithText>;

      await setDocs(col, makeTreeNode("", ["base", [["first"], ["middle"], ["last"]]]));

      await test
        .expect(
          runTransaction(firestoreForTest, async (tx) =>
            getFirstChildNode(tx, col, getDocumentData(await getDoc(doc(col, "base")))!),
          ),
        )
        .resolves.toEqual({
          id: "first",
          text: "first",
          prevId: "",
          nextId: "middle",
          parentId: "base",
          createdAt: timestampForCreatedAt,
          updatedAt: timestampForCreatedAt,
        });
    });

    test("multiple first child nodes", async (test) => {
      const now = new Date();
      const tid = `${test.task.id}_${now.getTime()}`;

      const col = collection(firestoreForTest, tid) as CollectionReference<TreeNodeWithText>;

      await setDocs(col, [
        {
          text: "base",
          prevId: "",
          nextId: "",
          parentId: "",
          createdAt: timestampForCreatedAt,
          updatedAt: timestampForCreatedAt,
        },
        {
          text: "first1",
          prevId: "",
          nextId: "",
          parentId: "base",
          createdAt: timestampForCreatedAt,
          updatedAt: timestampForCreatedAt,
        },
        {
          text: "first2",
          prevId: "",
          nextId: "",
          parentId: "base",
          createdAt: timestampForCreatedAt,
          updatedAt: timestampForCreatedAt,
        },
      ]);

      await test.expect(
        runTransaction(firestoreForTest, async (tx) =>
          getFirstChildNode(tx, col, getDocumentData(await getDoc(doc(col, "base")))!),
        ),
      ).rejects.toThrowErrorMatchingInlineSnapshot(`
        [Error: multiple first child nodes: {
          "baseNode": {
            "text": "base",
            "prevId": "",
            "nextId": "",
            "parentId": "",
            "createdAt": {
              "seconds": 4836316028,
              "nanoseconds": 0
            },
            "updatedAt": {
              "seconds": 4836316028,
              "nanoseconds": 0
            },
            "id": "base"
          },
          "childrenDocs": [
            {
              "text": "first1",
              "prevId": "",
              "nextId": "",
              "parentId": "base",
              "createdAt": {
                "seconds": 4836316028,
                "nanoseconds": 0
              },
              "updatedAt": {
                "seconds": 4836316028,
                "nanoseconds": 0
              },
              "id": "first1"
            },
            {
              "text": "first2",
              "prevId": "",
              "nextId": "",
              "parentId": "base",
              "createdAt": {
                "seconds": 4836316028,
                "nanoseconds": 0
              },
              "updatedAt": {
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

      await test
        .expect(
          runTransaction(firestoreForTest, async (tx) =>
            getLastChildNode(tx, col, getDocumentData(await getDoc(doc(col, "base")))!),
          ),
        )
        .resolves.toBeUndefined();
    });

    test("last child node exists", async (test) => {
      const now = new Date();
      const tid = `${test.task.id}_${now.getTime()}`;

      const col = collection(firestoreForTest, tid) as CollectionReference<TreeNodeWithText>;

      await setDocs(col, makeTreeNode("", ["base", [["first"], ["middle"], ["last"]]]));

      await test
        .expect(
          runTransaction(firestoreForTest, async (tx) =>
            getLastChildNode(tx, col, getDocumentData(await getDoc(doc(col, "base")))!),
          ),
        )
        .resolves.toEqual({
          id: "last",
          text: "last",
          prevId: "middle",
          nextId: "",
          parentId: "base",
          createdAt: timestampForCreatedAt,
          updatedAt: timestampForCreatedAt,
        });
    });

    test("multiple last child nodes", async (test) => {
      const now = new Date();
      const tid = `${test.task.id}_${now.getTime()}`;

      const col = collection(firestoreForTest, tid) as CollectionReference<TreeNodeWithText>;

      await setDocs(col, [
        {
          text: "base",
          prevId: "",
          nextId: "",
          parentId: "",
          createdAt: timestampForCreatedAt,
          updatedAt: timestampForCreatedAt,
        },
        {
          text: "last1",
          prevId: "",
          nextId: "",
          parentId: "base",
          createdAt: timestampForCreatedAt,
          updatedAt: timestampForCreatedAt,
        },
        {
          text: "last2",
          prevId: "",
          nextId: "",
          parentId: "base",
          createdAt: timestampForCreatedAt,
          updatedAt: timestampForCreatedAt,
        },
      ]);

      await test.expect(
        runTransaction(firestoreForTest, async (tx) =>
          getLastChildNode(tx, col, getDocumentData(await getDoc(doc(col, "base")))!),
        ),
      ).rejects.toThrowErrorMatchingInlineSnapshot(`
        [Error: multiple last child nodes: {
          "baseNode": {
            "text": "base",
            "prevId": "",
            "nextId": "",
            "parentId": "",
            "createdAt": {
              "seconds": 4836316028,
              "nanoseconds": 0
            },
            "updatedAt": {
              "seconds": 4836316028,
              "nanoseconds": 0
            },
            "id": "base"
          },
          "childrenDocs": [
            {
              "text": "last1",
              "prevId": "",
              "nextId": "",
              "parentId": "base",
              "createdAt": {
                "seconds": 4836316028,
                "nanoseconds": 0
              },
              "updatedAt": {
                "seconds": 4836316028,
                "nanoseconds": 0
              },
              "id": "last1"
            },
            {
              "text": "last2",
              "prevId": "",
              "nextId": "",
              "parentId": "base",
              "createdAt": {
                "seconds": 4836316028,
                "nanoseconds": 0
              },
              "updatedAt": {
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

  describe("unlinkFromSiblings", () => {
    test("no prev node, no next node", async (test) => {
      const now = new Date();
      const tid = `${test.task.id}_${now.getTime()}`;

      const col = collection(firestoreForTest, tid) as CollectionReference<TreeNodeWithText>;

      await setDocs(col, makeTreeNode("", ["base"]));

      await runTransaction(firestoreForTest, async (tx) => {
        (await unlinkFromSiblings(tx, col, (await txGet(tx, col, "base"))!))();
      });

      await test.expect(getDocs(col).then((qs) => qs.docs.map((d) => getDocumentData(d)))).resolves.toEqual([
        {
          id: "base",
          text: "base",
          prevId: "",
          nextId: "",
          parentId: "",
          createdAt: timestampForCreatedAt,
          updatedAt: timestampForCreatedAt,
        },
      ]);
    });

    test("no prev node, next node exists", async (test) => {
      const now = new Date();
      const tid = `${test.task.id}_${now.getTime()}`;

      const col = collection(firestoreForTest, tid) as CollectionReference<TreeNodeWithText>;

      await setDocs(col, makeTreeNodes("", [["base"], ["next"]]));

      await runTransaction(firestoreForTest, async (tx) => {
        (await unlinkFromSiblings(tx, col, (await txGet(tx, col, "base"))!))();
      });

      await test.expect(getDocs(col).then((qs) => qs.docs.map((d) => getDocumentData(d)))).resolves.toEqual([
        {
          id: "base",
          text: "base",
          prevId: "",
          nextId: "next",
          parentId: "",
          createdAt: timestampForCreatedAt,
          updatedAt: timestampForCreatedAt,
        },
        {
          id: "next",
          text: "next",
          prevId: "",
          nextId: "",
          parentId: "",
          createdAt: timestampForCreatedAt,
          updatedAt: timestampForServerTimestamp,
        },
      ]);
    });

    test("prev node exists, no next node", async (test) => {
      const now = new Date();
      const tid = `${test.task.id}_${now.getTime()}`;

      const col = collection(firestoreForTest, tid) as CollectionReference<TreeNodeWithText>;

      await setDocs(col, makeTreeNodes("", [["prev"], ["base"]]));

      await runTransaction(firestoreForTest, async (tx) => {
        (await unlinkFromSiblings(tx, col, (await txGet(tx, col, "base"))!))();
      });

      await test.expect(getDocs(col).then((qs) => qs.docs.map((d) => getDocumentData(d)))).resolves.toEqual([
        {
          id: "base",
          text: "base",
          prevId: "prev",
          nextId: "",
          parentId: "",
          createdAt: timestampForCreatedAt,
          updatedAt: timestampForCreatedAt,
        },
        {
          id: "prev",
          text: "prev",
          prevId: "",
          nextId: "",
          parentId: "",
          createdAt: timestampForCreatedAt,
          updatedAt: timestampForServerTimestamp,
        },
      ]);
    });

    test("prev node exists, next node exists", async (test) => {
      const now = new Date();
      const tid = `${test.task.id}_${now.getTime()}`;

      const col = collection(firestoreForTest, tid) as CollectionReference<TreeNodeWithText>;

      await setDocs(col, makeTreeNodes("", [["prev"], ["base"], ["next"]]));

      await runTransaction(firestoreForTest, async (tx) => {
        (await unlinkFromSiblings(tx, col, (await txGet(tx, col, "base"))!))();
      });

      await test.expect(getDocs(col).then((qs) => qs.docs.map((d) => getDocumentData(d)))).resolves.toEqual([
        {
          id: "base",
          text: "base",
          prevId: "prev",
          nextId: "next",
          parentId: "",
          createdAt: timestampForCreatedAt,
          updatedAt: timestampForCreatedAt,
        },
        {
          id: "next",
          text: "next",
          prevId: "prev",
          nextId: "",
          parentId: "",
          createdAt: timestampForCreatedAt,
          updatedAt: timestampForServerTimestamp,
        },
        {
          id: "prev",
          text: "prev",
          prevId: "",
          nextId: "next",
          parentId: "",
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

      await test
        .expect(runTransaction(firestoreForTest, async (tx) => getAboveNode(tx, col, (await txGet(tx, col, "base"))!)))
        .resolves.toBeUndefined();
    });

    test("no prev node, has parent node", async (test) => {
      const now = new Date();
      const tid = `${test.task.id}_${now.getTime()}`;

      const col = collection(firestoreForTest, tid) as CollectionReference<TreeNodeWithText>;
      await setDocs(col, makeTreeNode("", ["parent", [["base"]]]));

      await test
        .expect(runTransaction(firestoreForTest, async (tx) => getAboveNode(tx, col, (await txGet(tx, col, "base"))!)))
        .resolves.toEqual({
          id: "parent",
          text: "parent",
          prevId: "",
          nextId: "",
          parentId: "",
          createdAt: timestampForCreatedAt,
          updatedAt: timestampForCreatedAt,
        });
    });

    test("has prev node, no children nodes of prev node", async (test) => {
      const now = new Date();
      const tid = `${test.task.id}_${now.getTime()}`;

      const col = collection(firestoreForTest, tid) as CollectionReference<TreeNodeWithText>;
      await setDocs(col, makeTreeNodes("", [["prev"], ["base"]]));

      await test
        .expect(runTransaction(firestoreForTest, async (tx) => getAboveNode(tx, col, (await txGet(tx, col, "base"))!)))
        .resolves.toEqual({
          id: "prev",
          text: "prev",
          prevId: "",
          nextId: "base",
          parentId: "",
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

      await test
        .expect(runTransaction(firestoreForTest, async (tx) => getAboveNode(tx, col, (await txGet(tx, col, "base"))!)))
        .resolves.toEqual({
          id: "last of prev",
          text: "last of prev",
          prevId: "middle of prev",
          nextId: "",
          parentId: "prev",
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

      await test
        .expect(runTransaction(firestoreForTest, async (tx) => getAboveNode(tx, col, (await txGet(tx, col, "base"))!)))
        .resolves.toEqual({
          id: "last of last of prev",
          text: "last of last of prev",
          prevId: "middle of last of prev",
          nextId: "",
          parentId: "last of prev",
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

      await test
        .expect(runTransaction(firestoreForTest, async (tx) => getBelowNode(tx, col, (await txGet(tx, col, "base"))!)))
        .resolves.toBeUndefined();
    });

    test("no child node, no next node, has parent node, no next of parent node", async (test) => {
      const now = new Date();
      const tid = `${test.task.id}_${now.getTime()}`;

      const col = collection(firestoreForTest, tid) as CollectionReference<TreeNodeWithText>;
      await setDocs(col, makeTreeNode("", ["parent", [["base"]]]));

      await test
        .expect(runTransaction(firestoreForTest, async (tx) => getBelowNode(tx, col, (await txGet(tx, col, "base"))!)))
        .resolves.toBeUndefined();
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

      await test
        .expect(runTransaction(firestoreForTest, async (tx) => getBelowNode(tx, col, (await txGet(tx, col, "base"))!)))
        .resolves.toEqual({
          id: "first child of base",
          text: "first child of base",
          prevId: "",
          nextId: "middle child of base",
          parentId: "base",
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

      await test
        .expect(runTransaction(firestoreForTest, async (tx) => getBelowNode(tx, col, (await txGet(tx, col, "base"))!)))
        .resolves.toEqual({
          id: "next",
          text: "next",
          prevId: "base",
          nextId: "",
          parentId: "parent",
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

      await test
        .expect(runTransaction(firestoreForTest, async (tx) => getBelowNode(tx, col, (await txGet(tx, col, "base"))!)))
        .resolves.toEqual({
          id: "next of parent",
          text: "next of parent",
          prevId: "parent",
          nextId: "",
          parentId: "parent of parent",
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

      await test
        .expect(runTransaction(firestoreForTest, async (tx) => getBelowNode(tx, col, (await txGet(tx, col, "base"))!)))
        .resolves.toEqual({
          id: "next of parent of parent",
          text: "next of parent of parent",
          prevId: "parent of parent",
          nextId: "",
          parentId: "",
          createdAt: timestampForCreatedAt,
          updatedAt: timestampForCreatedAt,
        });
    });
  });

  describe("getBottomNode", () => {
    test("no child node", async (test) => {
      const now = new Date();
      const tid = `${test.task.id}_${now.getTime()}`;

      const col = collection(firestoreForTest, tid) as CollectionReference<TreeNodeWithText>;

      await setDocs(col, makeTreeNode("", ["base"]));

      await test
        .expect(runTransaction(firestoreForTest, async (tx) => getBottomNode(tx, col, (await txGet(tx, col, "base"))!)))
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

      await test
        .expect(runTransaction(firestoreForTest, async (tx) => getBottomNode(tx, col, (await txGet(tx, col, "base"))!)))
        .resolves.toEqual({
          id: "last child",
          text: "last child",
          prevId: "middle child",
          nextId: "",
          parentId: "base",
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

      await test
        .expect(runTransaction(firestoreForTest, async (tx) => getBottomNode(tx, col, (await txGet(tx, col, "base"))!)))
        .resolves.toEqual({
          id: "last grandchild",
          text: "last grandchild",
          prevId: "middle grandchild",
          nextId: "",
          parentId: "last child",
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

      await test
        .expect(runTransaction(firestoreForTest, async (tx) => getBottomNode(tx, col, (await txGet(tx, col, "base"))!)))
        .resolves.toEqual({
          id: "last great-grandchild",
          text: "last great-grandchild",
          prevId: "middle great-grandchild",
          nextId: "",
          parentId: "last grandchild",
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
        .expect(
          runTransaction(firestoreForTest, async (tx) =>
            getBottomNode(tx, childrenCol, (await txGet(tx, baseCol, "base"))!),
          ),
        )
        .resolves.toEqual({
          id: "last child",
          text: "last child",
          prevId: "middle child",
          nextId: "",
          parentId: "base",
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

      await setDocs(col, makeTreeNode("parent", ["base"]));

      await runTransaction(firestoreForTest, async (tx) => {
        const baseNode = await txGet(tx, col, "base");
        (
          await addPrevSibling(tx, col, baseNode!, {
            id: "newNode",
            text: "newNode",
            parentId: "",
            prevId: "",
            nextId: "",
            createdAt: Timestamp.fromMillis(0),
            updatedAt: Timestamp.fromMillis(0),
          })
        )();
      });

      await test.expect(getDocs(col).then((qs) => qs.docs.map((d) => getDocumentData(d)))).resolves.toEqual([
        {
          id: "base",
          text: "base",
          prevId: "newNode",
          nextId: "",
          parentId: "parent",
          createdAt: timestampForCreatedAt,
          updatedAt: timestampForServerTimestamp,
        },
        {
          id: "newNode",
          text: "newNode",
          prevId: "",
          nextId: "base",
          parentId: "parent",
          createdAt: timestampForServerTimestamp,
          updatedAt: timestampForServerTimestamp,
        },
      ]);
    });

    test("new node, has prev node", async (test) => {
      const now = new Date();
      const tid = `${test.task.id}_${now.getTime()}`;

      const col = collection(firestoreForTest, tid) as CollectionReference<TreeNodeWithText>;

      await setDocs(col, makeTreeNodes("parent", [["prev"], ["base"]]));

      await runTransaction(firestoreForTest, async (tx) => {
        const baseNode = await txGet(tx, col, "base");
        (
          await addPrevSibling(tx, col, baseNode!, {
            id: "newNode",
            text: "newNode",
            parentId: "",
            prevId: "",
            nextId: "",
            createdAt: Timestamp.fromMillis(0),
            updatedAt: Timestamp.fromMillis(0),
          })
        )();
      });

      await test.expect(getDocs(col).then((qs) => qs.docs.map((d) => getDocumentData(d)))).resolves.toEqual([
        {
          id: "base",
          text: "base",
          prevId: "newNode",
          nextId: "",
          parentId: "parent",
          createdAt: timestampForCreatedAt,
          updatedAt: timestampForServerTimestamp,
        },
        {
          id: "newNode",
          text: "newNode",
          prevId: "prev",
          nextId: "base",
          parentId: "parent",
          createdAt: timestampForServerTimestamp,
          updatedAt: timestampForServerTimestamp,
        },
        {
          id: "prev",
          text: "prev",
          prevId: "",
          nextId: "newNode",
          parentId: "parent",
          createdAt: timestampForCreatedAt,
          updatedAt: timestampForServerTimestamp,
        },
      ]);
    });

    test("existing node, no prev node", async (test) => {
      const now = new Date();
      const tid = `${test.task.id}_${now.getTime()}`;

      const col = collection(firestoreForTest, tid) as CollectionReference<TreeNodeWithText>;

      await setDocs(col, makeTreeNode("parent", ["base"]));
      await setDocs(col, makeTreeNode("", ["addingNode"]));

      await runTransaction(firestoreForTest, async (tx) => {
        const baseNode = await txGet(tx, col, "base");
        const addingNode = await txGet(tx, col, "addingNode");
        (await addPrevSibling(tx, col, baseNode!, addingNode!))();
      });

      await test.expect(getDocs(col).then((qs) => qs.docs.map((d) => getDocumentData(d)))).resolves.toEqual([
        {
          id: "addingNode",
          text: "addingNode",
          prevId: "",
          nextId: "base",
          parentId: "parent",
          createdAt: timestampForCreatedAt,
          updatedAt: timestampForServerTimestamp,
        },
        {
          id: "base",
          text: "base",
          prevId: "addingNode",
          nextId: "",
          parentId: "parent",
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

      await runTransaction(firestoreForTest, async (tx) => {
        const baseNode = await txGet(tx, col, "base");
        const addingNode = await txGet(tx, col, "addingNode");
        (await addPrevSibling(tx, col, baseNode!, addingNode!))();
      });

      await test.expect(getDocs(col).then((qs) => qs.docs.map((d) => getDocumentData(d)))).resolves.toEqual([
        {
          id: "addingNode",
          text: "addingNode",
          prevId: "prev",
          nextId: "base",
          parentId: "parent",
          createdAt: timestampForCreatedAt,
          updatedAt: timestampForServerTimestamp,
        },
        {
          id: "base",
          text: "base",
          prevId: "addingNode",
          nextId: "",
          parentId: "parent",
          createdAt: timestampForCreatedAt,
          updatedAt: timestampForServerTimestamp,
        },
        {
          id: "prev",
          text: "prev",
          prevId: "",
          nextId: "addingNode",
          parentId: "parent",
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

      await runTransaction(firestoreForTest, async (tx) => {
        const baseNode = await txGet(tx, col, "base");
        (
          await addNextSibling(tx, col, baseNode!, {
            id: "newNode",
            text: "newNode",
            parentId: "",
            prevId: "",
            nextId: "",
            createdAt: Timestamp.fromMillis(0),
            updatedAt: Timestamp.fromMillis(0),
          })
        )();
      });

      await test.expect(getDocs(col).then((qs) => qs.docs.map((d) => getDocumentData(d)))).resolves.toEqual([
        {
          id: "base",
          text: "base",
          prevId: "",
          nextId: "newNode",
          parentId: "parent",
          createdAt: timestampForCreatedAt,
          updatedAt: timestampForServerTimestamp,
        },
        {
          id: "newNode",
          text: "newNode",
          prevId: "base",
          nextId: "",
          parentId: "parent",
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

      await runTransaction(firestoreForTest, async (tx) => {
        const baseNode = await txGet(tx, col, "base");
        (
          await addNextSibling(tx, col, baseNode!, {
            id: "newNode",
            text: "newNode",
            parentId: "",
            prevId: "",
            nextId: "",
            createdAt: Timestamp.fromMillis(0),
            updatedAt: Timestamp.fromMillis(0),
          })
        )();
      });

      await test.expect(getDocs(col).then((qs) => qs.docs.map((d) => getDocumentData(d)))).resolves.toEqual([
        {
          id: "base",
          text: "base",
          prevId: "",
          nextId: "newNode",
          parentId: "parent",
          createdAt: timestampForCreatedAt,
          updatedAt: timestampForServerTimestamp,
        },
        {
          id: "newNode",
          text: "newNode",
          prevId: "base",
          nextId: "next",
          parentId: "parent",
          createdAt: timestampForServerTimestamp,
          updatedAt: timestampForServerTimestamp,
        },
        {
          id: "next",
          text: "next",
          prevId: "newNode",
          nextId: "",
          parentId: "parent",
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

      await runTransaction(firestoreForTest, async (tx) => {
        const baseNode = await txGet(tx, col, "base");
        const addingNode = await txGet(tx, col, "addingNode");
        (await addNextSibling(tx, col, baseNode!, addingNode!))();
      });

      await test.expect(getDocs(col).then((qs) => qs.docs.map((d) => getDocumentData(d)))).resolves.toEqual([
        {
          id: "addingNode",
          text: "addingNode",
          prevId: "base",
          nextId: "",
          parentId: "parent",
          createdAt: timestampForCreatedAt,
          updatedAt: timestampForServerTimestamp,
        },
        {
          id: "base",
          text: "base",
          prevId: "",
          nextId: "addingNode",
          parentId: "parent",
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

      await runTransaction(firestoreForTest, async (tx) => {
        const baseNode = await txGet(tx, col, "base");
        const addingNode = await txGet(tx, col, "addingNode");
        (await addNextSibling(tx, col, baseNode!, addingNode!))();
      });

      await test.expect(getDocs(col).then((qs) => qs.docs.map((d) => getDocumentData(d)))).resolves.toEqual([
        {
          id: "addingNode",
          text: "addingNode",
          prevId: "base",
          nextId: "next",
          parentId: "parent",
          createdAt: timestampForCreatedAt,
          updatedAt: timestampForServerTimestamp,
        },
        {
          id: "base",
          text: "base",
          prevId: "",
          nextId: "addingNode",
          parentId: "parent",
          createdAt: timestampForCreatedAt,
          updatedAt: timestampForServerTimestamp,
        },
        {
          id: "next",
          text: "next",
          prevId: "addingNode",
          nextId: "",
          parentId: "parent",
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

      await runTransaction(firestoreForTest, async (tx) => {
        const node = await txGet(tx, col, "node");
        (await indent(tx, col, node!))();
      });

      await test.expect(getDocs(col).then((qs) => qs.docs.map((d) => getDocumentData(d)))).resolves.toEqual([
        {
          id: "node",
          text: "node",
          prevId: "",
          nextId: "",
          parentId: "parent",
          createdAt: timestampForCreatedAt,
          updatedAt: timestampForCreatedAt,
        },
      ]);
    });

    test("has prev node, no children nodes of prev node", async (test) => {
      const now = new Date();
      const tid = `${test.task.id}_${now.getTime()}`;

      const col = collection(firestoreForTest, tid) as CollectionReference<TreeNodeWithText>;

      await setDocs(col, makeTreeNodes("parent", [["prev"], ["node"]]));

      await runTransaction(firestoreForTest, async (tx) => {
        const node = await txGet(tx, col, "node");
        (await indent(tx, col, node!))();
      });

      await test.expect(getDocs(col).then((qs) => qs.docs.map((d) => getDocumentData(d)))).resolves.toEqual([
        {
          id: "node",
          text: "node",
          prevId: "",
          nextId: "",
          parentId: "prev",
          createdAt: timestampForCreatedAt,
          updatedAt: timestampForServerTimestamp,
        },
        {
          id: "prev",
          text: "prev",
          prevId: "",
          nextId: "",
          parentId: "parent",
          createdAt: timestampForCreatedAt,
          updatedAt: timestampForServerTimestamp,
        },
      ]);
    });

    test("has prev node, has children nodes of prev node", async (test) => {
      const now = new Date();
      const tid = `${test.task.id}_${now.getTime()}`;

      const col = collection(firestoreForTest, tid) as CollectionReference<TreeNodeWithText>;
      // prettier-ignore
      await setDocs( col, makeTreeNodes("parent", [
        ["prev", [
          ["first of prev"],
          ["middle of prev"],
          ["last of prev"],
        ]],
        ["node"],
      ]));

      await runTransaction(firestoreForTest, async (tx) => {
        const node = await txGet(tx, col, "node");
        (await indent(tx, col, node!))();
      });

      await test.expect(getDocs(col).then((qs) => qs.docs.map((d) => getDocumentData(d)))).resolves.toEqual([
        {
          id: "first of prev",
          text: "first of prev",
          prevId: "",
          nextId: "middle of prev",
          parentId: "prev",
          createdAt: timestampForCreatedAt,
          updatedAt: timestampForCreatedAt,
        },
        {
          id: "last of prev",
          text: "last of prev",
          prevId: "middle of prev",
          nextId: "node",
          parentId: "prev",
          createdAt: timestampForCreatedAt,
          updatedAt: timestampForServerTimestamp,
        },
        {
          id: "middle of prev",
          text: "middle of prev",
          prevId: "first of prev",
          nextId: "last of prev",
          parentId: "prev",
          createdAt: timestampForCreatedAt,
          updatedAt: timestampForCreatedAt,
        },
        {
          id: "node",
          text: "node",
          prevId: "last of prev",
          nextId: "",
          parentId: "prev",
          createdAt: timestampForCreatedAt,
          updatedAt: timestampForServerTimestamp,
        },
        {
          id: "prev",
          text: "prev",
          prevId: "",
          nextId: "",
          parentId: "parent",
          createdAt: timestampForCreatedAt,
          updatedAt: timestampForServerTimestamp,
        },
      ]);
    });
  });
});
