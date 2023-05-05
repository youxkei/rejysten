import type { CollectionNameToDocumentType } from "@/services/rxdb/collections";
import type { RxDocument } from "rxdb";

export type ActionLog = CollectionNameToDocumentType["actionLogs"];
export type ActionLogDocument = RxDocument<ActionLog>;
