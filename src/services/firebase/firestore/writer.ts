import { type DocumentReference, type UpdateData, type WithFieldValue } from "firebase/firestore";

export interface Writer {
  set<T extends object>(documentRef: DocumentReference<T>, value: WithFieldValue<T>): unknown;
  update<T extends object>(documentRef: DocumentReference<T>, data: UpdateData<T>): unknown;
  delete<T extends object>(documentRef: DocumentReference<T>): unknown;
}
