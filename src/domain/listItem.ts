import { RxDocument } from "rxdb";

import { CollectionNameToDocumentType } from "@/rxdb/collections";

export type ListItem = CollectionNameToDocumentType["listItems"];
export type ListItemDocument = RxDocument<ListItem>;
