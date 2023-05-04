import type { CollectionNameToDocumentType } from "@/services/rxdb/collections";
import type { RxDocument } from "rxdb";

export type Store = CollectionNameToDocumentType["stores"];
export type StoreDocument = RxDocument<Store>;
