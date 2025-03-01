import equal from "fast-deep-equal";
import {
  type CollectionReference,
  type Timestamp,
  type WriteBatch,
  doc,
  query,
  serverTimestamp,
  where,
} from "firebase/firestore";

import { ErrorWithFields } from "@/error";
import { type DocumentData, type FirestoreService, getDoc, getDocs } from "@/services/firebase/firestore";
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
  service: FirestoreService,
  col: CollectionReference<T>,
  baseNode: DocumentData<T>,
): Promise<DocumentData<T> | undefined> {
  let prevNode: DocumentData<T> | undefined;

  if (baseNode.prevId !== "") {
    prevNode = await getDoc(service, col, baseNode.prevId);

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
  service: FirestoreService,
  col: CollectionReference<T>,
  baseNode: DocumentData<T>,
): Promise<DocumentData<T> | undefined> {
  let nextNode: DocumentData<T> | undefined;

  if (baseNode.nextId !== "") {
    nextNode = await getDoc(service, col, baseNode.nextId);

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
  service: FirestoreService,
  col: CollectionReference<T>,
  baseNode: DocumentData<T>,
): Promise<DocumentData<T> | undefined> {
  let aboveNode: DocumentData<T> | undefined;

  if (baseNode.aboveId !== "") {
    aboveNode = await getDoc(service, col, baseNode.aboveId);

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
  service: FirestoreService,
  col: CollectionReference<T>,
  baseNode: DocumentData<T>,
): Promise<DocumentData<T> | undefined> {
  let belowNode: DocumentData<T> | undefined;

  if (baseNode.belowId !== "") {
    belowNode = await getDoc(service, col, baseNode.belowId);

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
  service: FirestoreService,
  col: CollectionReference<T>,
  baseNode: DocumentData<T>,
): Promise<DocumentData<T> | undefined> {
  if (baseNode.parentId === "") {
    return undefined;
  }

  const parentNode = await getDoc(service, col, baseNode.parentId);

  if (parentNode === undefined) {
    // this is a normal situation because parentId may refer to a node of another collection
    return undefined;
  }

  return parentNode;
}

export async function getFirstChildNode<T extends TreeNode, U extends object>(
  service: FirestoreService,
  col: CollectionReference<T>,
  baseNode: DocumentData<U>,
): Promise<DocumentData<T> | undefined> {
  const children = await getDocs(service, query(col, where("parentId", "==", baseNode.id), where("prevId", "==", "")));
  if (children.length == 0) {
    return undefined;
  }
  if (children.length !== 1) {
    throw new InconsistentError("multiple first child nodes", {
      baseNode,
      childrenDocs: children,
    });
  }

  const firstChildNode = children[0];
  if (firstChildNode.parentId !== baseNode.id || firstChildNode.prevId !== "") {
    throw new TransactionAborted();
  }

  return firstChildNode;
}

export async function getLastChildNode<T extends TreeNode, U extends object>(
  service: FirestoreService,
  col: CollectionReference<T>,
  baseNode: DocumentData<U>,
): Promise<DocumentData<T> | undefined> {
  const children = await getDocs(service, query(col, where("parentId", "==", baseNode.id), where("nextId", "==", "")));
  if (children.length == 0) {
    return undefined;
  }

  if (children.length !== 1) {
    throw new InconsistentError("multiple last child nodes", {
      baseNode,
      childrenDocs: children,
    });
  }

  const lastChildNode = children[0];

  if (lastChildNode.parentId !== baseNode.id || lastChildNode.nextId !== "") {
    throw new TransactionAborted();
  }

  return lastChildNode;
}

export async function unlinkFromTree<T extends TreeNode>(
  service: FirestoreService,
  batch: WriteBatch,
  col: CollectionReference<T>,
  baseNode: DocumentData<T>,
): Promise<void> {
  const [prevNode, nextNode, aboveNode, bottomNode] = await Promise.all([
    getPrevNode(service, col, baseNode),
    getNextNode(service, col, baseNode),
    getAboveNode(service, col, baseNode),
    getBottomNodeInclusive(service, col, baseNode),
  ]);

  const belowNodeOfBottomNode = await getBelowNode(service, col, bottomNode);

  batch.update(doc(col, baseNode.id), {
    parentId: "",
    nextId: "",
    prevId: "",
    aboveId: "",
    updatedAt: serverTimestamp(),
  });

  batch.update(doc(col, bottomNode.id), { belowId: "", updatedAt: serverTimestamp() });

  if (prevNode) {
    batch.update(doc(col, prevNode.id), { nextId: baseNode.nextId, updatedAt: serverTimestamp() });
  }
  if (nextNode) {
    batch.update(doc(col, nextNode.id), { prevId: baseNode.prevId, updatedAt: serverTimestamp() });
  }

  if (aboveNode) {
    batch.update(doc(col, aboveNode.id), { belowId: bottomNode.belowId, updatedAt: serverTimestamp() });
  }

  if (belowNodeOfBottomNode) {
    batch.update(doc(col, belowNodeOfBottomNode.id), { aboveId: baseNode.aboveId, updatedAt: serverTimestamp() });
  }
}

export async function getBottomNodeInclusive<T extends TreeNode>(
  service: FirestoreService,
  col: CollectionReference<T>,
  baseNode: DocumentData<T>,
): Promise<DocumentData<T>> {
  let currentNode = baseNode;
  for (;;) {
    const lastChildNode = await getLastChildNode(service, col, currentNode);
    if (!lastChildNode) return currentNode;

    currentNode = lastChildNode;
  }
}

export async function getBottomNodeExclusive<T extends TreeNode, U extends object>(
  service: FirestoreService,
  col: CollectionReference<T>,
  baseNode: DocumentData<U>,
): Promise<DocumentData<T> | undefined> {
  const lastChildNode = await getLastChildNode(service, col, baseNode);
  if (!lastChildNode) return;

  let currentNode = lastChildNode;
  for (;;) {
    const lastChildNode = await getLastChildNode(service, col, currentNode);
    if (!lastChildNode) return currentNode;

    currentNode = lastChildNode;
  }
}

export async function addPrevSibling<T extends TreeNode>(
  service: FirestoreService,
  batch: WriteBatch,
  col: CollectionReference<T>,
  baseNode: DocumentData<T>,
  newNode: DocumentData<T>,
): Promise<void> {
  if (newNode.id === "") {
    throw new ErrorWithFields("new node must have a valid id", { newNode });
  }

  const fetchedNewNode = await getDoc(service, col, newNode.id);
  if (fetchedNewNode && !equal(newNode, fetchedNewNode)) {
    throw new ErrorWithFields("new node already exists", { newNode });
  }

  const [bottomNodeOfNewNode, prevNode, aboveNode] = await Promise.all([
    getBottomNodeInclusive(service, col, newNode),
    getPrevNode(service, col, baseNode),
    getAboveNode(service, col, baseNode),
  ]);

  const { id: _, ...newNodeData } = newNode;

  if (fetchedNewNode) {
    batch.update(doc(col, newNode.id), {
      parentId: baseNode.parentId,
      prevId: baseNode.prevId,
      nextId: baseNode.id,
      aboveId: baseNode.aboveId,
      updatedAt: serverTimestamp(),
    });
    batch.update(doc(col, bottomNodeOfNewNode.id), { belowId: baseNode.id, updatedAt: serverTimestamp() });
  } else {
    batch.set(doc(col, newNode.id), {
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

  batch.update(doc(col, baseNode.id), {
    prevId: newNode.id,
    aboveId: bottomNodeOfNewNode.id,
    updatedAt: serverTimestamp(),
  });

  if (prevNode) {
    batch.update(doc(col, prevNode.id), { nextId: newNode.id, updatedAt: serverTimestamp() });
  }

  if (aboveNode) {
    batch.update(doc(col, aboveNode.id), { belowId: newNode.id, updatedAt: serverTimestamp() });
  }
}

export async function addNextSibling<T extends TreeNode>(
  service: FirestoreService,
  batch: WriteBatch,
  col: CollectionReference<T>,
  baseNode: DocumentData<T>,
  newNode: DocumentData<T>,
): Promise<void> {
  if (newNode.id === "") {
    throw new ErrorWithFields("new node must have a valid id", { newNode });
  }

  const fetchedNewNode = await getDoc(service, col, newNode.id);
  if (fetchedNewNode && !equal(newNode, fetchedNewNode)) {
    throw new ErrorWithFields("new node already exists", { newNode });
  }

  const [bottomNodeOfBaseNode, bottomNodeOfNewNode, nextNode] = await Promise.all([
    getBottomNodeInclusive(service, col, baseNode),
    getBottomNodeInclusive(service, col, newNode),
    getNextNode(service, col, baseNode),
  ]);

  let newNextNodeOfNewNode: DocumentData<T> | undefined = nextNode;
  if (newNextNodeOfNewNode?.id == newNode.id) {
    newNextNodeOfNewNode = await getNextNode(service, col, newNextNodeOfNewNode);
  }

  let newAboveIdOfNewNode = bottomNodeOfBaseNode.id;
  let newAboveNodeOfNewNode: DocumentData<T> | undefined = bottomNodeOfBaseNode;
  if (newAboveIdOfNewNode == bottomNodeOfNewNode.id) {
    newAboveIdOfNewNode = newNode.aboveId;
    newAboveNodeOfNewNode = await getAboveNode(service, col, newNode);
  }
  let newBelowIdOfNewNode = bottomNodeOfBaseNode.belowId;
  let newBelowNodeOfNewNode = await getBelowNode(service, col, bottomNodeOfBaseNode);
  if (newBelowNodeOfNewNode?.id === newNode.id) {
    const bottom = await getBottomNodeInclusive(service, col, newBelowNodeOfNewNode);

    newBelowIdOfNewNode = bottom.belowId;
    newBelowNodeOfNewNode = await getBelowNode(service, col, bottom);
  }

  if (fetchedNewNode) {
    batch.update(doc(col, newNode.id), {
      parentId: baseNode.parentId,
      prevId: baseNode.id,
      nextId: baseNode.nextId,
      aboveId: newAboveIdOfNewNode,
      updatedAt: serverTimestamp(),
    });
    batch.update(doc(col, bottomNodeOfNewNode.id), { belowId: newBelowIdOfNewNode, updatedAt: serverTimestamp() });
  } else {
    batch.set(doc(col, newNode.id), {
      ...(newNode as unknown as T),
      parentId: baseNode.parentId,
      prevId: baseNode.id,
      nextId: baseNode.nextId,
      aboveId: newAboveIdOfNewNode,
      belowId: newBelowIdOfNewNode,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  }

  batch.update(doc(col, baseNode.id), { nextId: newNode.id, updatedAt: serverTimestamp() });

  if (newAboveNodeOfNewNode) {
    batch.update(doc(col, newAboveNodeOfNewNode.id), { belowId: newNode.id, updatedAt: serverTimestamp() });
  }

  if (newNextNodeOfNewNode) {
    batch.update(doc(col, newNextNodeOfNewNode.id), { prevId: newNode.id, updatedAt: serverTimestamp() });
  }

  if (newBelowNodeOfNewNode) {
    batch.update(doc(col, newBelowNodeOfNewNode.id), { aboveId: bottomNodeOfNewNode.id, updatedAt: serverTimestamp() });
  }
}

// BUG(youxkei): two indentation cause invalid belowId
export async function indent<T extends TreeNode>(
  service: FirestoreService,
  batch: WriteBatch,
  col: CollectionReference<T>,
  node: DocumentData<T>,
): Promise<void> {
  const prevNode = await getPrevNode(service, col, node);
  if (!prevNode) {
    return;
  }

  const lastChildNodeOfPrevNode = await getLastChildNode(service, col, prevNode);
  await unlinkFromTree(service, batch, col, node);

  if (lastChildNodeOfPrevNode) {
    await addNextSibling(service, batch, col, lastChildNodeOfPrevNode, node);
  } else {
    const bottomNodeOfNode = await getBottomNodeInclusive(service, col, node);
    const belowNodeOfBottomNodeOfNode = await getBelowNode(service, col, bottomNodeOfNode);

    batch.update(doc(col, node.id), {
      parentId: prevNode.id,
      prevId: "",
      nextId: "",
      aboveId: prevNode.id,
      updatedAt: serverTimestamp(),
    });

    batch.update(doc(col, bottomNodeOfNode.id), {
      belowId: bottomNodeOfNode.belowId,
      updatedAt: serverTimestamp(),
    });

    batch.update(doc(col, prevNode.id), {
      belowId: node.id,
      updatedAt: serverTimestamp(),
    });

    if (belowNodeOfBottomNodeOfNode) {
      batch.update(doc(col, belowNodeOfBottomNodeOfNode.id), {
        aboveId: bottomNodeOfNode.id,
        updatedAt: serverTimestamp(),
      });
    }
  }
}

export async function dedent<T extends TreeNode>(
  service: FirestoreService,
  batch: WriteBatch,
  col: CollectionReference<T>,
  node: DocumentData<T>,
): Promise<void> {
  const parentNode = await getParentNode(service, col, node);
  if (!parentNode) {
    return;
  }

  await unlinkFromTree(service, batch, col, node);
  await addNextSibling(service, batch, col, parentNode, node);
}

export async function movePrev<T extends TreeNode>(
  service: FirestoreService,
  batch: WriteBatch,
  col: CollectionReference<T>,
  node: DocumentData<T>,
): Promise<void> {
  const prevNode = await getPrevNode(service, col, node);
  if (!prevNode) {
    return;
  }

  await unlinkFromTree(service, batch, col, node);
  await addPrevSibling(service, batch, col, prevNode, node);
}

export async function moveNext<T extends TreeNode>(
  service: FirestoreService,
  batch: WriteBatch,
  col: CollectionReference<T>,
  node: DocumentData<T>,
): Promise<void> {
  const nextNode = await getNextNode(service, col, node);
  if (!nextNode) {
    return;
  }

  await unlinkFromTree(service, batch, col, node);
  await addNextSibling(service, batch, col, nextNode, node);
}

export async function remove<T extends TreeNode>(
  service: FirestoreService,
  batch: WriteBatch,
  col: CollectionReference<T>,
  node: DocumentData<T>,
): Promise<void> {
  const firstChildNode = await getFirstChildNode(service, col, node);
  if (firstChildNode) {
    throw new ErrorWithFields("cannot delete node with children", { node, firstChildNode });
  }

  await unlinkFromTree(service, batch, col, node);
  batch.delete(doc(col, node.id));
}
