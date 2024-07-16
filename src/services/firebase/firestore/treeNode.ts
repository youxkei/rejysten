import type { DocumentData } from "@/services/firebase/firestore";
import type { CollectionReference, Transaction } from "firebase/firestore";

import { runTransaction, setDoc, collection, doc, getDocs, query, where, getDoc } from "firebase/firestore";

import { txGet, getDocumentData } from "@/services/firebase/firestore";
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

export async function getNextNode<T extends TreeNode>(
  tx: Transaction,
  col: CollectionReference<T>,
  baseNode: DocumentData<T>,
): Promise<DocumentData<T> | undefined> {
  let nextNode: DocumentData<T> | undefined;

  if (baseNode.nextId !== "") {
    nextNode = await txGet(tx, col, baseNode.nextId);

    if (nextNode === undefined) {
      throw new InconsistentError("next node of baseNode is not exist", { baseNode });
    }

    if (nextNode.prevId !== baseNode.id) {
      throw new InconsistentError("previous node of next node of baseNode is not baseNode", {
        baseNode,
        nextNode,
      });
    }

    if (nextNode.parentId !== baseNode.parentId) {
      throw new InconsistentError("parent node of next node of baseNode is not one of baseNode", {
        baseNode,
        nextNode,
      });
    }
  }

  return nextNode;
}

if (import.meta.vitest) {
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
}

export async function getParentNode<T extends TreeNode>(
  tx: Transaction,
  col: CollectionReference<T>,
  baseNode: DocumentData<T>,
): Promise<DocumentData<T> | undefined> {
  if (baseNode.parentId === "") {
    return undefined;
  }

  const parentNode = await txGet(tx, col, baseNode.parentId);

  if (parentNode === undefined) {
    // this is a normal situation because parentId may refer to a node of another collection
    return undefined;
  }

  return parentNode;
}

if (import.meta.vitest) {
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
}

export async function getFirstChildNode<T extends TreeNode>(
  col: CollectionReference<T>,
  baseNode: DocumentData<T>,
): Promise<DocumentData<T> | undefined> {
  const children = await getDocs(query(col, where("parentId", "==", baseNode.id), where("prevId", "==", "")));

  if (children.empty) {
    return undefined;
  }

  const childrenDocs = children.docs.map((doc) => getDocumentData(doc));

  if (childrenDocs.length !== 1) {
    throw new InconsistentError("multiple first child nodes", { baseNode, childrenDocs });
  }

  return childrenDocs[0];
}

if (import.meta.vitest) {
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
}

export async function getLastChildNode<T extends TreeNode>(
  col: CollectionReference<T>,
  baseNode: DocumentData<T>,
): Promise<DocumentData<T> | undefined> {
  const children = await getDocs(query(col, where("parentId", "==", baseNode.id), where("nextId", "==", "")));

  if (children.empty) {
    return undefined;
  }

  const childrenDocs = children.docs.map((doc) => getDocumentData(doc));

  if (childrenDocs.length !== 1) {
    throw new InconsistentError("multiple last child nodes", { baseNode, childrenDocs });
  }

  return childrenDocs[0];
}

if (import.meta.vitest) {
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
}
