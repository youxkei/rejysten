import { type CollectionReference, type WriteBatch, doc, limit, orderBy, query, where } from "firebase/firestore";
import { generateKeyBetween } from "fractional-indexing";

import { ErrorWithFields } from "@/error";
import {
  type DocumentData,
  type FirestoreService,
  type Timestamps,
  getDoc,
  getDocs,
} from "@/services/firebase/firestore";
import { setDoc, updateDoc } from "@/services/firebase/firestore/batch";

export type TreeNode = {
  parentId: string;
  order: string;
} & Timestamps;

export async function getPrevNode<T extends TreeNode>(
  service: FirestoreService,
  col: CollectionReference<T>,
  baseNode: DocumentData<T>,
): Promise<DocumentData<T> | undefined> {
  const prevNodes = await getDocs(
    service,
    query(
      col,
      where("parentId", "==", baseNode.parentId),
      where("order", "<", baseNode.order),
      orderBy("order", "desc"),
      limit(1),
    ),
  );

  return prevNodes[0];
}

export async function getNextNode<T extends TreeNode>(
  service: FirestoreService,
  col: CollectionReference<T>,
  baseNode: DocumentData<T>,
): Promise<DocumentData<T> | undefined> {
  const nextNodes = await getDocs(
    service,
    query(
      col,
      where("parentId", "==", baseNode.parentId),
      where("order", ">", baseNode.order),
      orderBy("order", "asc"),
      limit(1),
    ),
  );

  return nextNodes[0];
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
  const children = await getDocs(
    service,
    query(col, where("parentId", "==", baseNode.id), orderBy("order", "asc"), limit(1)),
  );
  return children[0];
}

export async function getLastChildNode<T extends TreeNode, U extends object>(
  service: FirestoreService,
  col: CollectionReference<T>,
  baseNode: DocumentData<U>,
): Promise<DocumentData<T> | undefined> {
  const children = await getDocs(
    service,
    query(col, where("parentId", "==", baseNode.id), orderBy("order", "desc"), limit(1)),
  );
  return children[0];
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

export async function getAboveNode<T extends TreeNode>(
  service: FirestoreService,
  col: CollectionReference<T>,
  baseNode: DocumentData<T>,
): Promise<DocumentData<T> | undefined> {
  // Check if there's a previous sibling
  const prevNode = await getPrevNode(service, col, baseNode);
  if (prevNode) {
    // Return the bottom-most descendant of the previous sibling
    return getBottomNodeInclusive(service, col, prevNode);
  }

  // Otherwise, return the parent
  return getParentNode(service, col, baseNode);
}

export async function getBelowNode<T extends TreeNode>(
  service: FirestoreService,
  col: CollectionReference<T>,
  baseNode: DocumentData<T>,
): Promise<DocumentData<T> | undefined> {
  // Check if there's a first child
  const firstChild = await getFirstChildNode(service, col, baseNode);
  if (firstChild) {
    return firstChild;
  }

  // Check if there's a next sibling
  const nextNode = await getNextNode(service, col, baseNode);
  if (nextNode) {
    return nextNode;
  }

  // Go up the tree and find the next sibling of an ancestor
  let currentNode = baseNode;
  for (;;) {
    const parent = await getParentNode(service, col, currentNode);
    if (!parent) {
      return undefined;
    }

    const parentNextNode = await getNextNode(service, col, parent);
    if (parentNextNode) {
      return parentNextNode;
    }

    currentNode = parent;
  }
}

export function addSingle<T extends TreeNode>(
  service: FirestoreService,
  batch: WriteBatch,
  col: CollectionReference<T>,
  parentId: string,
  newNode: Omit<DocumentData<T>, keyof TreeNode>,
) {
  if (newNode.id === "") {
    throw new ErrorWithFields("new node must have a valid id", { newNode });
  }

  const order = generateKeyBetween(null, null);

  setDoc(service, batch, col, {
    ...(newNode as Omit<DocumentData<T>, keyof Timestamps>),
    parentId,
    order,
  });
}

export async function addPrevSibling<T extends TreeNode>(
  service: FirestoreService,
  batch: WriteBatch,
  col: CollectionReference<T>,
  baseNode: DocumentData<T>,
  newNode: Omit<DocumentData<T>, keyof TreeNode>,
): Promise<void> {
  if (newNode.id === "") {
    throw new ErrorWithFields("new node must have a valid id", { newNode });
  }

  const prevNode = await getPrevNode(service, col, baseNode);
  const newOrder = generateKeyBetween(prevNode?.order ?? null, baseNode.order);

  setDoc(service, batch, col, {
    ...(newNode as Omit<DocumentData<T>, keyof Timestamps>),
    parentId: baseNode.parentId,
    order: newOrder,
  });
}

export async function addNextSibling<T extends TreeNode>(
  service: FirestoreService,
  batch: WriteBatch,
  col: CollectionReference<T>,
  baseNode: DocumentData<T>,
  newNode: Omit<DocumentData<T>, keyof TreeNode>,
): Promise<void> {
  if (newNode.id === "") {
    throw new ErrorWithFields("new node must have a valid id", { newNode });
  }

  const nextNode = await getNextNode(service, col, baseNode);
  const newOrder = generateKeyBetween(baseNode.order, nextNode?.order ?? null);

  setDoc(service, batch, col, {
    ...(newNode as Omit<DocumentData<T>, keyof Timestamps>),
    parentId: baseNode.parentId,
    order: newOrder,
  });
}

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

  const lastChildOfPrevNode = await getLastChildNode(service, col, prevNode);
  const newOrder = generateKeyBetween(lastChildOfPrevNode?.order ?? null, null);

  updateDoc<TreeNode>(service, batch, col, {
    id: node.id,
    parentId: prevNode.id,
    order: newOrder,
  });
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

  const nextOfParent = await getNextNode(service, col, parentNode);
  const newOrder = generateKeyBetween(parentNode.order, nextOfParent?.order ?? null);

  updateDoc<TreeNode>(service, batch, col, {
    id: node.id,
    parentId: parentNode.parentId,
    order: newOrder,
  });
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

  const prevPrevNode = await getPrevNode(service, col, prevNode);
  const newOrder = generateKeyBetween(prevPrevNode?.order ?? null, prevNode.order);

  updateDoc<TreeNode>(service, batch, col, {
    id: node.id,
    order: newOrder,
  });
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

  const nextNextNode = await getNextNode(service, col, nextNode);
  const newOrder = generateKeyBetween(nextNode.order, nextNextNode?.order ?? null);

  updateDoc<TreeNode>(service, batch, col, {
    id: node.id,
    order: newOrder,
  });
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

  batch.delete(doc(col, node.id));
}
