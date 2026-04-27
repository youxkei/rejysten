import { type DocumentSnapshot } from "firebase/firestore";

export type DocumentWithId<T extends object> = T & { id: string };

export function getDocumentWithId<T extends object>(snapshot: DocumentSnapshot<T>): DocumentWithId<T> | undefined {
  const data = snapshot.data();
  return data === undefined ? undefined : { ...data, id: snapshot.id };
}
