import type { DocumentData } from "@/services/firebase/firestore";
import type { CollectionReference, Timestamp, Transaction } from "firebase/firestore";

import equal from "fast-deep-equal";
import { doc, getDocs, query, serverTimestamp, where } from "firebase/firestore";

import { ErrorWithFields } from "@/error";
import { txGet, getDocumentData } from "@/services/firebase/firestore";
import { InconsistentError, TransactionAborted } from "@/services/firebase/firestore/error";

export type TreeNode = { parentId: string; prevId: string; nextId: string; createdAt: Timestamp; updatedAt: Timestamp };

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

export async function getFirstChildNode<T extends TreeNode, U>(
  tx: Transaction,
  col: CollectionReference<T>,
  baseNode: DocumentData<U>,
): Promise<DocumentData<T> | undefined> {
  const children = await getDocs(query(col, where("parentId", "==", baseNode.id), where("prevId", "==", "")));

  if (children.empty) {
    return undefined;
  }

  if (children.docs.length !== 1) {
    throw new InconsistentError("multiple first child nodes", {
      baseNode,
      childrenDocs: children.docs.map((doc) => getDocumentData(doc)),
    });
  }

  const firstChildNode = getDocumentData(await tx.get(children.docs[0].ref));

  if (!firstChildNode || firstChildNode.parentId !== baseNode.id || firstChildNode.prevId !== "") {
    throw new TransactionAborted();
  }

  return firstChildNode;
}

export async function getLastChildNode<T extends TreeNode, U>(
  tx: Transaction,
  col: CollectionReference<T>,
  baseNode: DocumentData<U>,
): Promise<DocumentData<T> | undefined> {
  const children = await getDocs(query(col, where("parentId", "==", baseNode.id), where("nextId", "==", "")));

  if (children.empty) {
    return undefined;
  }

  if (children.docs.length !== 1) {
    throw new InconsistentError("multiple last child nodes", {
      baseNode,
      childrenDocs: children.docs.map((doc) => getDocumentData(doc)),
    });
  }

  const lastChildNode = getDocumentData(await tx.get(children.docs[0].ref));

  if (!lastChildNode || lastChildNode.parentId !== baseNode.id || lastChildNode.nextId !== "") {
    throw new TransactionAborted();
  }

  return lastChildNode;
}

export async function unlinkFromSiblings<T extends TreeNode>(
  tx: Transaction,
  col: CollectionReference<TreeNode>,
  baseNode: DocumentData<T>,
): Promise<() => void> {
  const [prevNode, nextNode] = await Promise.all([getPrevNode(tx, col, baseNode), getNextNode(tx, col, baseNode)]);

  return () => {
    if (prevNode) {
      tx.update(doc(col, prevNode.id), { nextId: baseNode.nextId, updatedAt: serverTimestamp() });
    }
    if (nextNode) {
      tx.update(doc(col, nextNode.id), { prevId: baseNode.prevId, updatedAt: serverTimestamp() });
    }
  };
}

export async function getAboveNode<T extends TreeNode>(
  tx: Transaction,
  col: CollectionReference<T>,
  baseNode: DocumentData<T>,
): Promise<DocumentData<T> | undefined> {
  const prevNode = await getPrevNode(tx, col, baseNode);

  if (prevNode) {
    let currentNode = prevNode;

    for (;;) {
      const lastChildNode = await getLastChildNode(tx, col, currentNode);

      if (!lastChildNode) return currentNode;

      currentNode = lastChildNode;
    }
  }

  return getParentNode(tx, col, baseNode);
}

export async function getBelowNode<T extends TreeNode>(
  tx: Transaction,
  col: CollectionReference<T>,
  baseNode: DocumentData<T>,
): Promise<DocumentData<T> | undefined> {
  const firstChildNode = await getFirstChildNode(tx, col, baseNode);
  if (firstChildNode) return firstChildNode;

  let currentNode: DocumentData<T> | undefined = baseNode;
  while (currentNode) {
    const nextNode = await getNextNode(tx, col, currentNode);
    if (nextNode) return nextNode;

    currentNode = await getParentNode(tx, col, currentNode);
  }
}

export async function getBottomNode<T extends TreeNode, U>(
  tx: Transaction,
  col: CollectionReference<T>,
  baseNode: DocumentData<U>,
): Promise<DocumentData<T> | undefined> {
  const lastChildNode = await getLastChildNode(tx, col, baseNode);
  if (!lastChildNode) return;

  let currentNode = lastChildNode;
  for (;;) {
    const lastChildNode = await getLastChildNode(tx, col, currentNode);
    if (!lastChildNode) return currentNode;

    currentNode = lastChildNode;
  }
}

export async function addPrevSibling<T extends TreeNode>(
  tx: Transaction,
  col: CollectionReference<T>,
  baseNode: DocumentData<T>,
  newNode: DocumentData<T>,
): Promise<() => void> {
  if (newNode.id === "") {
    throw new ErrorWithFields("new node must have a valid id", { newNode });
  }

  const fetchedNewNode = await txGet(tx, col, newNode.id);
  if (fetchedNewNode && !equal(newNode, fetchedNewNode)) {
    throw new TransactionAborted();
  }

  const { id: _, ...newNodeData } = newNode;

  const prevNode = await getPrevNode(tx, col, baseNode);

  return () => {
    if (prevNode) {
      if (fetchedNewNode) {
        tx.update(doc(col, newNode.id), {
          parentId: baseNode.parentId,
          prevId: prevNode.id,
          nextId: baseNode.id,
          updatedAt: serverTimestamp(),
        });
      } else {
        tx.set(doc(col, newNode.id), {
          ...(newNodeData as unknown as T),
          parentId: baseNode.parentId,
          prevId: prevNode.id,
          nextId: baseNode.id,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      }

      tx.update(doc(col, prevNode.id), { nextId: newNode.id, updatedAt: serverTimestamp() });
      tx.update(doc(col, baseNode.id), { prevId: newNode.id, updatedAt: serverTimestamp() });
    } else {
      if (fetchedNewNode) {
        tx.update(doc(col, newNode.id), {
          parentId: baseNode.parentId,
          prevId: "",
          nextId: baseNode.id,
          updatedAt: serverTimestamp(),
        });
      } else {
        tx.set(doc(col, newNode.id), {
          ...(newNodeData as unknown as T),
          parentId: baseNode.parentId,
          prevId: "",
          nextId: baseNode.id,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      }

      tx.update(doc(col, baseNode.id), { prevId: newNode.id, updatedAt: serverTimestamp() });
    }
  };
}

export async function addNextSibling<T extends TreeNode>(
  tx: Transaction,
  col: CollectionReference<T>,
  baseNode: DocumentData<T>,
  newNode: DocumentData<T>,
): Promise<() => void> {
  if (newNode.id === "") {
    throw new ErrorWithFields("new node must have a valid id", { newNode });
  }

  const fetchedNewNode = await txGet(tx, col, newNode.id);
  if (fetchedNewNode && !equal(newNode, fetchedNewNode)) {
    throw new TransactionAborted();
  }

  const { id: _, ...newNodeData } = newNode;

  const nextNode = await getNextNode(tx, col, baseNode);

  return () => {
    if (nextNode) {
      if (fetchedNewNode) {
        tx.update(doc(col, newNode.id), {
          parentId: baseNode.parentId,
          prevId: baseNode.id,
          nextId: nextNode.id,
          updatedAt: serverTimestamp(),
        });
      } else {
        tx.set(doc(col, newNode.id), {
          ...(newNodeData as unknown as T),
          parentId: baseNode.parentId,
          prevId: baseNode.id,
          nextId: nextNode.id,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      }

      tx.update(doc(col, nextNode.id), { prevId: newNode.id, updatedAt: serverTimestamp() });
      tx.update(doc(col, baseNode.id), { nextId: newNode.id, updatedAt: serverTimestamp() });
    } else {
      if (fetchedNewNode) {
        tx.update(doc(col, newNode.id), {
          parentId: baseNode.parentId,
          prevId: baseNode.id,
          nextId: "",
          updatedAt: serverTimestamp(),
        });
      } else {
        tx.set(doc(col, newNode.id), {
          ...(newNodeData as unknown as T),
          parentId: baseNode.parentId,
          prevId: baseNode.id,
          nextId: "",
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      }

      tx.update(doc(col, baseNode.id), { nextId: newNode.id, updatedAt: serverTimestamp() });
    }
  };
}

export async function indent<T extends TreeNode>(
  tx: Transaction,
  col: CollectionReference<T>,
  node: DocumentData<T>,
): Promise<() => void> {
  const prevNode = await getPrevNode(tx, col, node);
  if (!prevNode) {
    return () => {
      // no write
    };
  }

  const lastChildNodeOfPrevNode = await getLastChildNode(tx, col, prevNode);
  const unlinkFromSiblingsWrite = await unlinkFromSiblings(tx, col, node);

  if (lastChildNodeOfPrevNode) {
    const addNextSiblingWrite = await addNextSibling(tx, col, lastChildNodeOfPrevNode, node);

    return () => {
      unlinkFromSiblingsWrite();
      addNextSiblingWrite();
    };
  }

  return () => {
    unlinkFromSiblingsWrite();
    tx.update(doc(col, node.id), {
      parentId: prevNode.id,
      prevId: "",
      nextId: "",
      updatedAt: serverTimestamp(),
    });
  };
}

export async function dedent<T extends TreeNode>(
  tx: Transaction,
  col: CollectionReference<T>,
  node: DocumentData<T>,
): Promise<() => void> {
  const parentNode = await getParentNode(tx, col, node);
  if (!parentNode) {
    return () => {
      // no write
    };
  }

  const unlinkFromSiblingsWrite = await unlinkFromSiblings(tx, col, node);
  const addNextSiblingWrite = await addNextSibling(tx, col, parentNode, node);

  return () => {
    unlinkFromSiblingsWrite();
    addNextSiblingWrite();
  };
}
