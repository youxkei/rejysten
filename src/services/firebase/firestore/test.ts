import type { CollectionReference } from "firebase/firestore";

import { setDoc, doc } from "firebase/firestore";

export async function setDocs<T extends { text: string }>(col: CollectionReference<T>, treeNodes: T[]) {
  for (const treeNode of treeNodes) {
    await setDoc(doc(col, treeNode.text), treeNode);
  }
}
