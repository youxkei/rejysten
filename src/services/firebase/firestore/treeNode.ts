import type { DocumentData } from "@/services/firebase/firestore";
import type { CollectionReference, Transaction } from "firebase/firestore";

import { getDocs, query, where } from "firebase/firestore";

import { txGet, getDocumentData } from "@/services/firebase/firestore";
import { InconsistentError } from "@/services/firebase/firestore/error";

export type TreeNode = { parentId: string; prevId: string; nextId: string };

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
