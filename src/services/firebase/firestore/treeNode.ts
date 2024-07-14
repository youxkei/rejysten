import type { DocumentData } from "@/services/firebase/firestore";
import type { CollectionReference, Transaction } from "firebase/firestore";

import { runTransaction, setDoc, collection, doc } from "firebase/firestore";

import { txGet } from "@/services/firebase/firestore";
import { InconsistentError } from "@/services/firebase/firestore/error";
import { firestoreForTest } from "@/services/firebase/test";

type TreeNode = { parentId: string; prevId: string; nextId: string };

export async function getPrevNode<T extends TreeNode>(
  tx: Transaction,
  col: CollectionReference<T>,
  baseNode: DocumentData<T>,
): Promise<DocumentData<T> | undefined> {
  let prevNode: DocumentData<T> | undefined;

  if (baseNode.prevId !== "") {
    prevNode = await txGet(tx, col, baseNode.prevId);

    if (prevNode === undefined) {
      throw new InconsistentError("previous node of baseNode is not exist", { baseNode });
    }

    if (prevNode.nextId !== baseNode.id) {
      throw new InconsistentError("next node of previous node of baseNode is not baseNode", {
        baseNode,
        prevNode,
      });
    }

    if (prevNode.parentId !== baseNode.parentId) {
      throw new InconsistentError("parent node of previous node of baseNode is not one of baseNode", {
        baseNode,
        prevNode,
      });
    }
  }

  return prevNode;
}

if (import.meta.vitest) {
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
}
