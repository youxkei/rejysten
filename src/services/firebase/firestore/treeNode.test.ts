import type { TreeNode } from "@/services/firebase/firestore/treeNode";
import type { CollectionReference } from "firebase/firestore";

import { runTransaction, collection, doc, getDoc, getDocs } from "firebase/firestore";
import { describe, test } from "vitest";

import { txGet, getDocumentData } from "@/services/firebase/firestore";
import { setDocs } from "@/services/firebase/firestore/test";
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
    },
    ...makeTreeNodes(text, children ?? []),
  ];
}

describe.concurrent("treeNode", () => {
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
        },
        {
          text: "base",
          prevId: "prev",
          nextId: "",
          parentId: "",
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
            "id": "base"
          },
          "prevNode": {
            "text": "prev",
            "prevId": "",
            "nextId": "invalid",
            "parentId": "",
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
        },
        {
          text: "base",
          prevId: "prev",
          nextId: "",
          parentId: "bar",
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
            "id": "base"
          },
          "prevNode": {
            "text": "prev",
            "prevId": "",
            "nextId": "base",
            "parentId": "foo",
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
        },
        {
          text: "next",
          prevId: "invalid",
          nextId: "",
          parentId: "",
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
            "id": "base"
          },
          "nextNode": {
            "text": "next",
            "prevId": "invalid",
            "nextId": "",
            "parentId": "",
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
        },
        {
          text: "next",
          prevId: "base",
          nextId: "",
          parentId: "bar",
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
            "id": "base"
          },
          "nextNode": {
            "text": "next",
            "prevId": "base",
            "nextId": "",
            "parentId": "bar",
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
        },
        {
          text: "first1",
          prevId: "",
          nextId: "",
          parentId: "base",
        },
        {
          text: "first2",
          prevId: "",
          nextId: "",
          parentId: "base",
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
            "id": "base"
          },
          "childrenDocs": [
            {
              "text": "first1",
              "prevId": "",
              "nextId": "",
              "parentId": "base",
              "id": "first1"
            },
            {
              "text": "first2",
              "prevId": "",
              "nextId": "",
              "parentId": "base",
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
        },
        {
          text: "last1",
          prevId: "",
          nextId: "",
          parentId: "base",
        },
        {
          text: "last2",
          prevId: "",
          nextId: "",
          parentId: "base",
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
            "id": "base"
          },
          "childrenDocs": [
            {
              "text": "last1",
              "prevId": "",
              "nextId": "",
              "parentId": "base",
              "id": "last1"
            },
            {
              "text": "last2",
              "prevId": "",
              "nextId": "",
              "parentId": "base",
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
        await unlinkFromSiblings(tx, col, (await txGet(tx, col, "base"))!);
      });

      await test.expect(getDocs(col).then((qs) => qs.docs.map((d) => getDocumentData(d)))).resolves.toEqual([
        {
          text: "base",
          prevId: "",
          nextId: "",
          parentId: "",
          id: "base",
        },
      ]);
    });

    test("no prev node, next node exists", async (test) => {
      const now = new Date();
      const tid = `${test.task.id}_${now.getTime()}`;

      const col = collection(firestoreForTest, tid) as CollectionReference<TreeNodeWithText>;

      await setDocs(col, makeTreeNodes("", [["base"], ["next"]]));

      await runTransaction(firestoreForTest, async (tx) => {
        await unlinkFromSiblings(tx, col, (await txGet(tx, col, "base"))!);
      });

      await test.expect(getDocs(col).then((qs) => qs.docs.map((d) => getDocumentData(d)))).resolves.toEqual([
        {
          text: "base",
          prevId: "",
          nextId: "next",
          parentId: "",
          id: "base",
        },
        {
          text: "next",
          prevId: "",
          nextId: "",
          parentId: "",
          id: "next",
        },
      ]);
    });

    test("prev node exists, no next node", async (test) => {
      const now = new Date();
      const tid = `${test.task.id}_${now.getTime()}`;

      const col = collection(firestoreForTest, tid) as CollectionReference<TreeNodeWithText>;

      await setDocs(col, makeTreeNodes("", [["prev"], ["base"]]));

      await runTransaction(firestoreForTest, async (tx) => {
        await unlinkFromSiblings(tx, col, (await txGet(tx, col, "base"))!);
      });

      await test.expect(getDocs(col).then((qs) => qs.docs.map((d) => getDocumentData(d)))).resolves.toEqual([
        {
          text: "base",
          prevId: "prev",
          nextId: "",
          parentId: "",
          id: "base",
        },
        {
          text: "prev",
          prevId: "",
          nextId: "",
          parentId: "",
          id: "prev",
        },
      ]);
    });

    test("prev node exists, next node exists", async (test) => {
      const now = new Date();
      const tid = `${test.task.id}_${now.getTime()}`;

      const col = collection(firestoreForTest, tid) as CollectionReference<TreeNodeWithText>;

      await setDocs(col, makeTreeNodes("", [["prev"], ["base"], ["next"]]));

      await runTransaction(firestoreForTest, async (tx) => {
        await unlinkFromSiblings(tx, col, (await txGet(tx, col, "base"))!);
      });

      await test.expect(getDocs(col).then((qs) => qs.docs.map((d) => getDocumentData(d)))).resolves.toEqual([
        {
          text: "base",
          prevId: "prev",
          nextId: "next",
          parentId: "",
          id: "base",
        },
        {
          text: "next",
          prevId: "prev",
          nextId: "",
          parentId: "",
          id: "next",
        },
        {
          text: "prev",
          prevId: "",
          nextId: "next",
          parentId: "",
          id: "prev",
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
        });
    });
  });
});
