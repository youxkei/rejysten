import type { CollectionNameToDocumentType } from "@/rxdb/collections";
import type { RxDocument } from "rxdb";

export type ListItem = CollectionNameToDocumentType["listItems"];
export type ListItemDocument = RxDocument<ListItem>;
