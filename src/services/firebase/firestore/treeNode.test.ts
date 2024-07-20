import type { TreeNode } from "@/services/firebase/firestore/treeNode";
import type { CollectionReference } from "firebase/firestore";

import { runTransaction, setDoc, collection, doc, getDoc, getDocs } from "firebase/firestore";
import { describe, test } from "vitest";

import { txGet, getDocumentData } from "@/services/firebase/firestore";
import {
  getFirstChildNode,
  getLastChildNode,
  getNextNode,
  getParentNode,
  getPrevNode,
  unlinkFromSiblings,
} from "@/services/firebase/firestore/treeNode";
import { firestoreForTest } from "@/services/firebase/test";

describe.concurrent("treeNode", () => {
  describe("getPrevNode", () => {
    test("no prev node", async (test) => {
      const now = new Date();
      const tid = `${test.task.id}_${now.getTime()}`;

      const col = collection(firestoreForTest, tid) as CollectionReference<TreeNode & { text: string }>;

      await setDoc(doc(col, "base"), {
        text: "base",
        prevId: "",
        nextId: "",
        parentId: "",
      });

      await test
        .expect(
          runTransaction(firestoreForTest, async (tx) => {
            return getPrevNode(tx, col, (await txGet(tx, col, "base"))!);
          }),
        )
        .resolves.toBeUndefined();
    });

    test("prev node exists", async (test) => {
      const now = new Date();
      const tid = `${test.task.id}_${now.getTime()}`;

      const col = collection(firestoreForTest, tid) as CollectionReference<TreeNode & { text: string }>;

      await setDoc(doc(col, "prev"), {
        text: "prev",
        prevId: "",
        nextId: "base",
        parentId: "",
      });

      await setDoc(doc(col, "base"), {
        text: "base",
        prevId: "prev",
        nextId: "",
        parentId: "",
      });

      await test
        .expect(
          runTransaction(firestoreForTest, async (tx) => {
            return getPrevNode(tx, col, (await txGet(tx, col, "base"))!);
          }),
        )
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

      const col = collection(firestoreForTest, tid) as CollectionReference<TreeNode & { text: string }>;

      await setDoc(doc(col, "base"), {
        text: "base",
        prevId: "invalid",
        nextId: "",
        parentId: "",
      });

      await test.expect(() =>
        runTransaction(firestoreForTest, async (tx) => {
          return getPrevNode(tx, col, (await txGet(tx, col, "base"))!);
        }),
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

      const col = collection(firestoreForTest, tid) as CollectionReference<TreeNode & { text: string }>;

      await setDoc(doc(col, "prev"), {
        text: "prev",
        prevId: "",
        nextId: "invalid",
        parentId: "",
      });

      await setDoc(doc(col, "base"), {
        text: "base",
        prevId: "prev",
        nextId: "",
        parentId: "",
      });

      await test.expect(() =>
        runTransaction(firestoreForTest, async (tx) => {
          return getPrevNode(tx, col, (await txGet(tx, col, "base"))!);
        }),
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

      const col = collection(firestoreForTest, tid) as CollectionReference<TreeNode & { text: string }>;

      await setDoc(doc(col, "prev"), {
        text: "prev",
        prevId: "",
        nextId: "base",
        parentId: "foo",
      });

      await setDoc(doc(col, "base"), {
        text: "base",
        prevId: "prev",
        nextId: "",
        parentId: "bar",
      });

      await test.expect(() =>
        runTransaction(firestoreForTest, async (tx) => {
          return getPrevNode(tx, col, (await txGet(tx, col, "base"))!);
        }),
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

      const col = collection(firestoreForTest, tid) as CollectionReference<TreeNode & { text: string }>;

      await setDoc(doc(col, "base"), {
        text: "base",
        prevId: "",
        nextId: "",
        parentId: "",
      });

      await test
        .expect(
          runTransaction(firestoreForTest, async (tx) => {
            return getNextNode(tx, col, (await txGet(tx, col, "base"))!);
          }),
        )
        .resolves.toBeUndefined();
    });

    test("next node exists", async (test) => {
      const now = new Date();
      const tid = `${test.task.id}_${now.getTime()}`;

      const col = collection(firestoreForTest, tid) as CollectionReference<TreeNode & { text: string }>;

      await setDoc(doc(col, "base"), {
        text: "base",
        prevId: "",
        nextId: "next",
        parentId: "",
      });

      await setDoc(doc(col, "next"), {
        text: "next",
        prevId: "base",
        nextId: "",
        parentId: "",
      });

      await test
        .expect(
          runTransaction(firestoreForTest, async (tx) => {
            return getNextNode(tx, col, (await txGet(tx, col, "base"))!);
          }),
        )
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

      const col = collection(firestoreForTest, tid) as CollectionReference<TreeNode & { text: string }>;

      await setDoc(doc(col, "base"), {
        text: "base",
        prevId: "",
        nextId: "invalid",
        parentId: "",
      });

      await test.expect(() =>
        runTransaction(firestoreForTest, async (tx) => {
          return getNextNode(tx, col, (await txGet(tx, col, "base"))!);
        }),
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

      const col = collection(firestoreForTest, tid) as CollectionReference<TreeNode & { text: string }>;

      await setDoc(doc(col, "base"), {
        text: "base",
        prevId: "",
        nextId: "next",
        parentId: "",
      });

      await setDoc(doc(col, "next"), {
        text: "next",
        prevId: "invalid",
        nextId: "",
        parentId: "",
      });

      await test.expect(() =>
        runTransaction(firestoreForTest, async (tx) => {
          return getNextNode(tx, col, (await txGet(tx, col, "base"))!);
        }),
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

      const col = collection(firestoreForTest, tid) as CollectionReference<TreeNode & { text: string }>;

      await setDoc(doc(col, "base"), {
        text: "base",
        prevId: "",
        nextId: "next",
        parentId: "foo",
      });

      await setDoc(doc(col, "next"), {
        text: "next",
        prevId: "base",
        nextId: "",
        parentId: "bar",
      });

      await test.expect(() =>
        runTransaction(firestoreForTest, async (tx) => {
          return getNextNode(tx, col, (await txGet(tx, col, "base"))!);
        }),
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

      const col = collection(firestoreForTest, tid) as CollectionReference<TreeNode & { text: string }>;

      await setDoc(doc(col, "base"), {
        text: "base",
        prevId: "",
        nextId: "",
        parentId: "",
      });

      await test
        .expect(
          runTransaction(firestoreForTest, async (tx) => {
            return getParentNode(tx, col, (await txGet(tx, col, "base"))!);
          }),
        )
        .resolves.toBeUndefined();
    });

    test("parent node exists", async (test) => {
      const now = new Date();
      const tid = `${test.task.id}_${now.getTime()}`;

      const col = collection(firestoreForTest, tid) as CollectionReference<TreeNode & { text: string }>;

      await setDoc(doc(col, "parent"), {
        text: "parent",
        prevId: "",
        nextId: "",
        parentId: "",
      });

      await setDoc(doc(col, "base"), {
        text: "base",
        prevId: "",
        nextId: "",
        parentId: "parent",
      });

      await test
        .expect(
          runTransaction(firestoreForTest, async (tx) => {
            return getParentNode(tx, col, (await txGet(tx, col, "base"))!);
          }),
        )
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

      const col = collection(firestoreForTest, tid) as CollectionReference<TreeNode & { text: string }>;

      await setDoc(doc(col, "base"), {
        text: "base",
        prevId: "",
        nextId: "",
        parentId: "another_collection_id",
      });

      await test
        .expect(
          runTransaction(firestoreForTest, async (tx) => {
            return getParentNode(tx, col, (await txGet(tx, col, "base"))!);
          }),
        )
        .resolves.toBeUndefined();
    });
  });

  describe("getFirstChildNode", () => {
    test("no first child node", async (test) => {
      const now = new Date();
      const tid = `${test.task.id}_${now.getTime()}`;

      const col = collection(firestoreForTest, tid) as CollectionReference<TreeNode & { text: string }>;

      await setDoc(doc(col, "base"), {
        text: "base",
        prevId: "",
        nextId: "",
        parentId: "",
      });

      await test
        .expect(getFirstChildNode(col, getDocumentData(await getDoc(doc(col, "base")))!))
        .resolves.toBeUndefined();
    });

    test("first child node exists", async (test) => {
      const now = new Date();
      const tid = `${test.task.id}_${now.getTime()}`;

      const col = collection(firestoreForTest, tid) as CollectionReference<TreeNode & { text: string }>;

      await setDoc(doc(col, "base"), {
        text: "base",
        prevId: "",
        nextId: "",
        parentId: "",
      });

      await setDoc(doc(col, "first"), {
        text: "first",
        prevId: "",
        nextId: "",
        parentId: "base",
      });

      await test.expect(getFirstChildNode(col, getDocumentData(await getDoc(doc(col, "base")))!)).resolves.toEqual({
        id: "first",
        text: "first",
        prevId: "",
        nextId: "",
        parentId: "base",
      });
    });

    test("multiple first child nodes", async (test) => {
      const now = new Date();
      const tid = `${test.task.id}_${now.getTime()}`;

      const col = collection(firestoreForTest, tid) as CollectionReference<TreeNode & { text: string }>;

      await setDoc(doc(col, "base"), {
        text: "base",
        prevId: "",
        nextId: "",
        parentId: "",
      });

      await setDoc(doc(col, "first1"), {
        text: "first1",
        prevId: "",
        nextId: "",
        parentId: "base",
      });

      await setDoc(doc(col, "first2"), {
        text: "first2",
        prevId: "",
        nextId: "",
        parentId: "base",
      });

      await test.expect(async () => getFirstChildNode(col, getDocumentData(await getDoc(doc(col, "base")))!)).rejects
        .toThrowErrorMatchingInlineSnapshot(`
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

      const col = collection(firestoreForTest, tid) as CollectionReference<TreeNode & { text: string }>;

      await setDoc(doc(col, "base"), {
        text: "base",
        prevId: "",
        nextId: "",
        parentId: "",
      });

      await test
        .expect(getLastChildNode(col, getDocumentData(await getDoc(doc(col, "base")))!))
        .resolves.toBeUndefined();
    });

    test("last child node exists", async (test) => {
      const now = new Date();
      const tid = `${test.task.id}_${now.getTime()}`;

      const col = collection(firestoreForTest, tid) as CollectionReference<TreeNode & { text: string }>;

      await setDoc(doc(col, "base"), {
        text: "base",
        prevId: "",
        nextId: "",
        parentId: "",
      });

      await setDoc(doc(col, "last"), {
        text: "last",
        prevId: "",
        nextId: "",
        parentId: "base",
      });

      await test.expect(getLastChildNode(col, getDocumentData(await getDoc(doc(col, "base")))!)).resolves.toEqual({
        id: "last",
        text: "last",
        prevId: "",
        nextId: "",
        parentId: "base",
      });
    });

    test("multiple last child nodes", async (test) => {
      const now = new Date();
      const tid = `${test.task.id}_${now.getTime()}`;

      const col = collection(firestoreForTest, tid) as CollectionReference<TreeNode & { text: string }>;

      await setDoc(doc(col, "base"), {
        text: "base",
        prevId: "",
        nextId: "",
        parentId: "",
      });

      await setDoc(doc(col, "last1"), {
        text: "last1",
        prevId: "",
        nextId: "",
        parentId: "base",
      });

      await setDoc(doc(col, "last2"), {
        text: "last2",
        prevId: "",
        nextId: "",
        parentId: "base",
      });

      await test.expect(async () => getLastChildNode(col, getDocumentData(await getDoc(doc(col, "base")))!)).rejects
        .toThrowErrorMatchingInlineSnapshot(`
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

      const col = collection(firestoreForTest, tid) as CollectionReference<TreeNode & { text: string }>;

      await setDoc(doc(col, "base"), {
        text: "base",
        prevId: "",
        nextId: "",
        parentId: "",
      });

      await runTransaction(firestoreForTest, async (tx) => {
        return unlinkFromSiblings(tx, col, (await txGet(tx, col, "base"))!);
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

      const col = collection(firestoreForTest, tid) as CollectionReference<TreeNode & { text: string }>;

      await setDoc(doc(col, "base"), {
        text: "base",
        prevId: "",
        nextId: "next",
        parentId: "",
      });

      await setDoc(doc(col, "next"), {
        text: "next",
        prevId: "base",
        nextId: "",
        parentId: "",
      });

      await runTransaction(firestoreForTest, async (tx) => {
        return unlinkFromSiblings(tx, col, (await txGet(tx, col, "base"))!);
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

      const col = collection(firestoreForTest, tid) as CollectionReference<TreeNode & { text: string }>;

      await setDoc(doc(col, "prev"), {
        text: "prev",
        prevId: "",
        nextId: "base",
        parentId: "",
      });

      await setDoc(doc(col, "base"), {
        text: "base",
        prevId: "prev",
        nextId: "",
        parentId: "",
      });

      await runTransaction(firestoreForTest, async (tx) => {
        return unlinkFromSiblings(tx, col, (await txGet(tx, col, "base"))!);
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

      const col = collection(firestoreForTest, tid) as CollectionReference<TreeNode & { text: string }>;

      await setDoc(doc(col, "prev"), {
        text: "prev",
        prevId: "",
        nextId: "base",
        parentId: "",
      });

      await setDoc(doc(col, "base"), {
        text: "base",
        prevId: "prev",
        nextId: "next",
        parentId: "",
      });

      await setDoc(doc(col, "next"), {
        text: "next",
        prevId: "base",
        nextId: "",
        parentId: "",
      });

      await runTransaction(firestoreForTest, async (tx) => {
        return unlinkFromSiblings(tx, col, (await txGet(tx, col, "base"))!);
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
});
