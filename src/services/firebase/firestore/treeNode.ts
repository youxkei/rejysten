import { generateKeyBetween } from "fractional-indexing";

import { ErrorWithFields } from "@/error";
import {
  type DocumentData,
  type FirestoreService,
  type SchemaCollectionReference,
  type Timestamps,
  getDoc,
  getDocs,
} from "@/services/firebase/firestore";
import { type OperationRecordingBatch } from "@/services/firebase/firestore/batch";
import { orderBy, query, where } from "@/services/firebase/firestore/query";
import { type Schema } from "@/services/firebase/firestore/schema";

export type TreeNode = {
  parentId: string;
  order: string;
} & Timestamps;

export type TreeNodeCollection = { [C in keyof Schema]: Schema[C] extends TreeNode ? C : never }[keyof Schema];

export async function getPrevNode<C extends TreeNodeCollection>(
  service: FirestoreService,
  col: SchemaCollectionReference<C>,
  baseNode: DocumentData<Schema[C]>,
  options?: { fromServer?: boolean },
): Promise<DocumentData<Schema[C]> | undefined> {
  const prevNodes = await getDocs(
    service,
    query(
      col,
      where("parentId", "==", baseNode.parentId),
      where("order", "<", baseNode.order),
      orderBy("order", "desc"),
    ),
    options,
  );

  return prevNodes[0];
}

export async function getNextNode<C extends TreeNodeCollection>(
  service: FirestoreService,
  col: SchemaCollectionReference<C>,
  baseNode: DocumentData<Schema[C]>,
  options?: { fromServer?: boolean },
): Promise<DocumentData<Schema[C]> | undefined> {
  const nextNodes = await getDocs(
    service,
    query(
      col,
      where("parentId", "==", baseNode.parentId),
      where("order", ">", baseNode.order),
      orderBy("order", "asc"),
    ),
    options,
  );

  return nextNodes[0];
}

export async function getParentNode<C extends TreeNodeCollection>(
  service: FirestoreService,
  col: SchemaCollectionReference<C>,
  baseNode: DocumentData<Schema[C]>,
  options?: { fromServer?: boolean },
): Promise<DocumentData<Schema[C]> | undefined> {
  if (baseNode.parentId === "") {
    return undefined;
  }

  const parentNode = await getDoc(service, col, baseNode.parentId, options);

  if (parentNode === undefined) {
    // this is a normal situation because parentId may refer to a node of another collection
    return undefined;
  }

  return parentNode;
}

export async function getFirstChildNode<C extends TreeNodeCollection>(
  service: FirestoreService,
  col: SchemaCollectionReference<C>,
  baseNode: { id: string },
  options?: { fromServer?: boolean },
): Promise<DocumentData<Schema[C]> | undefined> {
  const children = await getDocs(
    service,
    query(col, where("parentId", "==", baseNode.id), orderBy("order", "asc")),
    options,
  );
  return children[0];
}

export async function getLastChildNode<C extends TreeNodeCollection>(
  service: FirestoreService,
  col: SchemaCollectionReference<C>,
  baseNode: { id: string },
  options?: { fromServer?: boolean },
): Promise<DocumentData<Schema[C]> | undefined> {
  const children = await getDocs(
    service,
    query(col, where("parentId", "==", baseNode.id), orderBy("order", "desc")),
    options,
  );
  return children[0];
}

export async function getBottomNodeInclusive<C extends TreeNodeCollection>(
  service: FirestoreService,
  col: SchemaCollectionReference<C>,
  baseNode: DocumentData<Schema[C]>,
  options?: { fromServer?: boolean },
): Promise<DocumentData<Schema[C]>> {
  let currentNode = baseNode;
  for (;;) {
    const lastChildNode = await getLastChildNode(service, col, currentNode, options);
    if (!lastChildNode) return currentNode;

    currentNode = lastChildNode;
  }
}

export async function getBottomNodeExclusive<C extends TreeNodeCollection>(
  service: FirestoreService,
  col: SchemaCollectionReference<C>,
  baseNode: { id: string },
  options?: { fromServer?: boolean },
): Promise<DocumentData<Schema[C]> | undefined> {
  const lastChildNode = await getLastChildNode(service, col, baseNode, options);
  if (!lastChildNode) return;

  let currentNode = lastChildNode;
  for (;;) {
    const lastChildNode = await getLastChildNode(service, col, currentNode, options);
    if (!lastChildNode) return currentNode;

    currentNode = lastChildNode;
  }
}

export async function getAboveNode<C extends TreeNodeCollection>(
  service: FirestoreService,
  col: SchemaCollectionReference<C>,
  baseNode: DocumentData<Schema[C]>,
  options?: { fromServer?: boolean },
): Promise<DocumentData<Schema[C]> | undefined> {
  // Check if there's a previous sibling
  const prevNode = await getPrevNode(service, col, baseNode, options);
  if (prevNode) {
    // Return the bottom-most descendant of the previous sibling
    return getBottomNodeInclusive(service, col, prevNode, options);
  }

  // Otherwise, return the parent
  return getParentNode(service, col, baseNode, options);
}

export async function getBelowNode<C extends TreeNodeCollection>(
  service: FirestoreService,
  col: SchemaCollectionReference<C>,
  baseNode: DocumentData<Schema[C]>,
  options?: { fromServer?: boolean },
): Promise<DocumentData<Schema[C]> | undefined> {
  // Check if there's a first child
  const firstChild = await getFirstChildNode(service, col, baseNode, options);
  if (firstChild) {
    return firstChild;
  }

  // Check if there's a next sibling
  const nextNode = await getNextNode(service, col, baseNode, options);
  if (nextNode) {
    return nextNode;
  }

  // Go up the tree and find the next sibling of an ancestor
  let currentNode = baseNode;
  for (;;) {
    const parent = await getParentNode(service, col, currentNode, options);
    if (!parent) {
      return undefined;
    }

    const parentNextNode = await getNextNode(service, col, parent, options);
    if (parentNextNode) {
      return parentNextNode;
    }

    currentNode = parent;
  }
}

export function addSingle<C extends TreeNodeCollection>(
  service: FirestoreService,
  batch: OperationRecordingBatch,
  col: SchemaCollectionReference<C>,
  parentId: string,
  newNode: Omit<DocumentData<Schema[C]>, keyof TreeNode>,
) {
  if (newNode.id === "") {
    throw new ErrorWithFields("new node must have a valid id", { newNode });
  }

  const order = generateKeyBetween(null, null);

  batch.set(col, {
    ...(newNode as Omit<DocumentData<Schema[C]>, keyof Timestamps>),
    parentId,
    order,
  });
}

export async function addPrevSibling<C extends TreeNodeCollection>(
  service: FirestoreService,
  batch: OperationRecordingBatch,
  col: SchemaCollectionReference<C>,
  baseNode: DocumentData<Schema[C]>,
  newNode: Omit<DocumentData<Schema[C]>, keyof TreeNode>,
  options?: { fromServer?: boolean },
): Promise<void> {
  if (newNode.id === "") {
    throw new ErrorWithFields("new node must have a valid id", { newNode });
  }

  const prevNode = await getPrevNode(service, col, baseNode, options);
  const newOrder = generateKeyBetween(prevNode?.order ?? null, baseNode.order);

  batch.set(col, {
    ...(newNode as Omit<DocumentData<Schema[C]>, keyof Timestamps>),
    parentId: baseNode.parentId,
    order: newOrder,
  });
}

export async function addNextSibling<C extends TreeNodeCollection>(
  service: FirestoreService,
  batch: OperationRecordingBatch,
  col: SchemaCollectionReference<C>,
  baseNode: DocumentData<Schema[C]>,
  newNode: Omit<DocumentData<Schema[C]>, keyof TreeNode>,
  options?: { fromServer?: boolean },
): Promise<void> {
  if (newNode.id === "") {
    throw new ErrorWithFields("new node must have a valid id", { newNode });
  }

  const nextNode = await getNextNode(service, col, baseNode, options);
  const newOrder = generateKeyBetween(baseNode.order, nextNode?.order ?? null);

  batch.set(col, {
    ...(newNode as Omit<DocumentData<Schema[C]>, keyof Timestamps>),
    parentId: baseNode.parentId,
    order: newOrder,
  });
}

export async function indent<C extends TreeNodeCollection>(
  service: FirestoreService,
  batch: OperationRecordingBatch,
  col: SchemaCollectionReference<C>,
  node: DocumentData<Schema[C]>,
  options?: { fromServer?: boolean },
): Promise<void> {
  const prevNode = await getPrevNode(service, col, node, options);
  if (!prevNode) {
    return;
  }

  const lastChildOfPrevNode = await getLastChildNode(service, col, prevNode, options);
  const newOrder = generateKeyBetween(lastChildOfPrevNode?.order ?? null, null);

  batch.update(col, {
    id: node.id,
    parentId: prevNode.id,
    order: newOrder,
  } as DocumentData<Omit<Partial<Schema[C]>, keyof Timestamps>>);
}

export async function dedent<C extends TreeNodeCollection>(
  service: FirestoreService,
  batch: OperationRecordingBatch,
  col: SchemaCollectionReference<C>,
  node: DocumentData<Schema[C]>,
  options?: { fromServer?: boolean },
): Promise<void> {
  const parentNode = await getParentNode(service, col, node, options);
  if (!parentNode) {
    return;
  }

  const nextOfParent = await getNextNode(service, col, parentNode, options);
  const newOrder = generateKeyBetween(parentNode.order, nextOfParent?.order ?? null);

  batch.update(col, {
    id: node.id,
    parentId: parentNode.parentId,
    order: newOrder,
  } as DocumentData<Omit<Partial<Schema[C]>, keyof Timestamps>>);
}

export async function movePrev<C extends TreeNodeCollection>(
  service: FirestoreService,
  batch: OperationRecordingBatch,
  col: SchemaCollectionReference<C>,
  node: DocumentData<Schema[C]>,
  options?: { fromServer?: boolean },
): Promise<void> {
  const prevNode = await getPrevNode(service, col, node, options);
  if (!prevNode) {
    return;
  }

  const prevPrevNode = await getPrevNode(service, col, prevNode, options);
  const newOrder = generateKeyBetween(prevPrevNode?.order ?? null, prevNode.order);

  batch.update(col, {
    id: node.id,
    order: newOrder,
  } as DocumentData<Omit<Partial<Schema[C]>, keyof Timestamps>>);
}

export async function moveNext<C extends TreeNodeCollection>(
  service: FirestoreService,
  batch: OperationRecordingBatch,
  col: SchemaCollectionReference<C>,
  node: DocumentData<Schema[C]>,
  options?: { fromServer?: boolean },
): Promise<void> {
  const nextNode = await getNextNode(service, col, node, options);
  if (!nextNode) {
    return;
  }

  const nextNextNode = await getNextNode(service, col, nextNode, options);
  const newOrder = generateKeyBetween(nextNode.order, nextNextNode?.order ?? null);

  batch.update(col, {
    id: node.id,
    order: newOrder,
  } as DocumentData<Omit<Partial<Schema[C]>, keyof Timestamps>>);
}

export async function remove<C extends TreeNodeCollection>(
  service: FirestoreService,
  batch: OperationRecordingBatch,
  col: SchemaCollectionReference<C>,
  node: DocumentData<Schema[C]>,
  options?: { fromServer?: boolean },
): Promise<void> {
  const firstChildNode = await getFirstChildNode(service, col, node, options);
  if (firstChildNode) {
    throw new ErrorWithFields("cannot delete node with children", { node, firstChildNode });
  }

  batch.delete(col, node.id);
}
