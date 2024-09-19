import equal from "fast-deep-equal";
import {
  type CollectionReference,
  type Timestamp,
  type Transaction,
  doc,
  getDocs,
  query,
  serverTimestamp,
  where,
} from "firebase/firestore";

import { ErrorWithFields } from "@/error";
import { type DocumentData, txGet, getDocumentData } from "@/services/firebase/firestore";
import { InconsistentError, TransactionAborted } from "@/services/firebase/firestore/error";

export type TreeNode = {
  parentId: string;
  prevId: string;
  nextId: string;
  aboveId: string;
  belowId: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
};

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

export async function getAboveNode<T extends TreeNode>(
  tx: Transaction,
  col: CollectionReference<T>,
  baseNode: DocumentData<T>,
): Promise<DocumentData<T> | undefined> {
  let aboveNode: DocumentData<T> | undefined;

  if (baseNode.aboveId !== "") {
    aboveNode = await txGet(tx, col, baseNode.aboveId);

    if (aboveNode === undefined) {
      throw new InconsistentError("above node of baseNode does not exist", { baseNode });
    }

    if (aboveNode.belowId !== baseNode.id) {
      throw new InconsistentError("below node of above node of baseNode is not baseNode", {
        baseNode,
        aboveNode,
      });
    }
  }

  return aboveNode;
}

export async function getBelowNode<T extends TreeNode>(
  tx: Transaction,
  col: CollectionReference<T>,
  baseNode: DocumentData<T>,
): Promise<DocumentData<T> | undefined> {
  let belowNode: DocumentData<T> | undefined;

  if (baseNode.belowId !== "") {
    belowNode = await txGet(tx, col, baseNode.belowId);

    if (belowNode === undefined) {
      throw new InconsistentError("below node of baseNode does not exist", { baseNode });
    }

    if (belowNode.aboveId !== baseNode.id) {
      throw new InconsistentError("above node of below node of baseNode is not baseNode", {
        baseNode,
        belowNode,
      });
    }
  }

  return belowNode;
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

export async function getFirstChildNode<T extends TreeNode, U extends object>(
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

export async function getLastChildNode<T extends TreeNode, U extends object>(
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

export async function unlinkFromTree<T extends TreeNode>(
  tx: Transaction,
  col: CollectionReference<TreeNode>,
  baseNode: DocumentData<T>,
): Promise<() => void> {
  const [prevNode, nextNode, aboveNode, bottomNode] = await Promise.all([
    getPrevNode(tx, col, baseNode),
    getNextNode(tx, col, baseNode),
    getAboveNode(tx, col, baseNode),
    getBottomNodeInclusive(tx, col, baseNode),
  ]);

  const belowNodeOfBottomNode = await getBelowNode(tx, col, bottomNode);

  return () => {
    tx.update(doc(col, baseNode.id), {
      parentId: "",
      nextId: "",
      prevId: "",
      aboveId: "",
      updatedAt: serverTimestamp(),
    });
    tx.update(doc(col, bottomNode.id), { belowId: "", updatedAt: serverTimestamp() });

    if (prevNode) {
      tx.update(doc(col, prevNode.id), { nextId: baseNode.nextId, updatedAt: serverTimestamp() });
    }
    if (nextNode) {
      tx.update(doc(col, nextNode.id), { prevId: baseNode.prevId, updatedAt: serverTimestamp() });
    }

    if (aboveNode) {
      tx.update(doc(col, aboveNode.id), { belowId: bottomNode.belowId, updatedAt: serverTimestamp() });
    }

    if (belowNodeOfBottomNode) {
      tx.update(doc(col, belowNodeOfBottomNode.id), { aboveId: baseNode.aboveId, updatedAt: serverTimestamp() });
    }
  };
}

export async function getBottomNodeInclusive<T extends TreeNode>(
  tx: Transaction,
  col: CollectionReference<T>,
  baseNode: DocumentData<T>,
): Promise<DocumentData<T>> {
  let currentNode = baseNode;
  for (;;) {
    const lastChildNode = await getLastChildNode(tx, col, currentNode);
    if (!lastChildNode) return currentNode;

    currentNode = lastChildNode;
  }
}

export async function getBottomNodeExclusive<T extends TreeNode, U extends object>(
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

  const [bottomNodeOfNewNode, prevNode, aboveNode] = await Promise.all([
    getBottomNodeInclusive(tx, col, newNode),
    getPrevNode(tx, col, baseNode),
    getAboveNode(tx, col, baseNode),
  ]);

  const { id: _, ...newNodeData } = newNode;

  return () => {
    if (fetchedNewNode) {
      tx.update(doc(col, newNode.id), {
        parentId: baseNode.parentId,
        prevId: baseNode.prevId,
        nextId: baseNode.id,
        aboveId: baseNode.aboveId,
        updatedAt: serverTimestamp(),
      });
      tx.update(doc(col, bottomNodeOfNewNode.id), {
        belowId: baseNode.id,
        updatedAt: serverTimestamp(),
      });
    } else {
      tx.set(doc(col, newNode.id), {
        ...(newNodeData as unknown as T),
        parentId: baseNode.parentId,
        prevId: baseNode.prevId,
        nextId: baseNode.id,
        aboveId: baseNode.aboveId,
        belowId: baseNode.id,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }

    tx.update(doc(col, baseNode.id), {
      prevId: newNode.id,
      aboveId: bottomNodeOfNewNode.id,
      updatedAt: serverTimestamp(),
    });

    if (prevNode) {
      tx.update(doc(col, prevNode.id), { nextId: newNode.id, updatedAt: serverTimestamp() });
    }

    if (aboveNode) {
      tx.update(doc(col, aboveNode.id), { belowId: newNode.id, updatedAt: serverTimestamp() });
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

  const [bottomNodeOfBaseNode, bottomNodeOfNewNode, nextNode] = await Promise.all([
    getBottomNodeInclusive(tx, col, baseNode),
    getBottomNodeInclusive(tx, col, newNode),
    getNextNode(tx, col, baseNode),
  ]);

  let newNextNodeOfNewNode: DocumentData<T> | undefined = nextNode;
  if (newNextNodeOfNewNode?.id == newNode.id) {
    newNextNodeOfNewNode = await getNextNode(tx, col, newNextNodeOfNewNode);
  }

  let newAboveIdOfNewNode = bottomNodeOfBaseNode.id;
  let newAboveNodeOfNewNode: DocumentData<T> | undefined = bottomNodeOfBaseNode;
  if (newAboveIdOfNewNode == bottomNodeOfNewNode.id) {
    newAboveIdOfNewNode = newNode.aboveId;
    newAboveNodeOfNewNode = await getAboveNode(tx, col, newNode);
  }

  let newBelowIdOfNewNode = bottomNodeOfBaseNode.belowId;
  let newBelowNodeOfNewNode = await getBelowNode(tx, col, bottomNodeOfBaseNode);
  if (newBelowNodeOfNewNode?.id === newNode.id) {
    const bottom = await getBottomNodeInclusive(tx, col, newBelowNodeOfNewNode);

    newBelowIdOfNewNode = bottom.belowId;
    newBelowNodeOfNewNode = await getBelowNode(tx, col, bottom);
  }

  const { id: _, ...newNodeData } = newNode;

  return () => {
    if (fetchedNewNode) {
      tx.update(doc(col, newNode.id), {
        parentId: baseNode.parentId,
        prevId: baseNode.id,
        nextId: baseNode.nextId,
        aboveId: newAboveIdOfNewNode,
        updatedAt: serverTimestamp(),
      });
      tx.update(doc(col, bottomNodeOfNewNode.id), {
        belowId: newBelowIdOfNewNode,
        updatedAt: serverTimestamp(),
      });
    } else {
      tx.set(doc(col, newNode.id), {
        ...(newNodeData as unknown as T),
        parentId: baseNode.parentId,
        prevId: baseNode.id,
        nextId: baseNode.nextId,
        aboveId: newAboveIdOfNewNode,
        belowId: newBelowIdOfNewNode,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }

    tx.update(doc(col, baseNode.id), {
      nextId: newNode.id,
      updatedAt: serverTimestamp(),
    });

    if (newAboveNodeOfNewNode) {
      tx.update(doc(col, newAboveNodeOfNewNode.id), { belowId: newNode.id, updatedAt: serverTimestamp() });
    }

    if (newNextNodeOfNewNode) {
      tx.update(doc(col, newNextNodeOfNewNode.id), { prevId: newNode.id, updatedAt: serverTimestamp() });
    }

    if (newBelowNodeOfNewNode) {
      tx.update(doc(col, newBelowNodeOfNewNode.id), { aboveId: bottomNodeOfNewNode.id, updatedAt: serverTimestamp() });
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
  const unlinkFromTreeWrite = await unlinkFromTree(tx, col, node);

  if (lastChildNodeOfPrevNode) {
    const addNextSiblingWrite = await addNextSibling(tx, col, lastChildNodeOfPrevNode, node);

    return () => {
      unlinkFromTreeWrite();
      addNextSiblingWrite();
    };
  }

  const bottomNodeOfNode = await getBottomNodeInclusive(tx, col, node);
  const belowNodeOfBottomNodeOfNode = await getBelowNode(tx, col, bottomNodeOfNode);

  return () => {
    unlinkFromTreeWrite();

    tx.update(doc(col, node.id), {
      parentId: prevNode.id,
      prevId: "",
      nextId: "",
      aboveId: prevNode.id,
      updatedAt: serverTimestamp(),
    });

    tx.update(doc(col, bottomNodeOfNode.id), {
      belowId: node.nextId,
    });

    tx.update(doc(col, prevNode.id), { belowId: node.id, updatedAt: serverTimestamp() });

    if (belowNodeOfBottomNodeOfNode) {
      tx.update(doc(col, belowNodeOfBottomNodeOfNode.id), {
        aboveId: bottomNodeOfNode.id,
        updatedAt: serverTimestamp(),
      });
    }
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

  const unlinkFromTreeWrite = await unlinkFromTree(tx, col, node);
  const addNextSiblingWrite = await addNextSibling(tx, col, parentNode, node);

  return () => {
    unlinkFromTreeWrite();
    addNextSiblingWrite();
  };
}

export async function movePrev<T extends TreeNode>(
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

  const unlinkFromTreeWrite = await unlinkFromTree(tx, col, node);
  const addPrevSiblingWrite = await addPrevSibling(tx, col, prevNode, node);

  return () => {
    unlinkFromTreeWrite();
    addPrevSiblingWrite();
  };
}

export async function moveNext<T extends TreeNode>(
  tx: Transaction,
  col: CollectionReference<T>,
  node: DocumentData<T>,
): Promise<() => void> {
  const nextNode = await getNextNode(tx, col, node);
  if (!nextNode) {
    return () => {
      // no write
    };
  }

  const unlinkFromTreeWrite = await unlinkFromTree(tx, col, node);
  const addNextSiblingWrite = await addNextSibling(tx, col, nextNode, node);

  return () => {
    unlinkFromTreeWrite();
    addNextSiblingWrite();
  };
}

export async function remove<T extends TreeNode>(
  tx: Transaction,
  col: CollectionReference<T>,
  node: DocumentData<T>,
): Promise<() => void> {
  const unlinkFromTreeWrite = await unlinkFromTree(tx, col, node);

  return () => {
    unlinkFromTreeWrite();
    tx.delete(doc(col, node.id));
  };
}
