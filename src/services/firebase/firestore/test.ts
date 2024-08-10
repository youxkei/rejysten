import type { CollectionReference } from "firebase/firestore";

import { setDoc, doc, Timestamp } from "firebase/firestore";

export async function setDocs<T extends { text: string }>(col: CollectionReference<T>, treeNodes: T[]) {
  for (const treeNode of treeNodes) {
    await setDoc(doc(col, treeNode.text), treeNode);
  }
}

export const timestampForCreatedAt = Timestamp.fromDate(new Date("2123-04-05T06:07:08+09:00"));
export const timestampForServerTimestamp = Timestamp.fromDate(new Date("2345-06-07T08:09:10+09:00"));
