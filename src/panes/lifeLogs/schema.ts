import { type Timestamp } from "firebase/firestore";

import { collectionNgramConfig } from "@/services/firebase/firestore/ngram";

declare module "@/services/firebase/firestore/schema" {
  interface Schema {
    lifeLogs: {
      text: string;

      startAt: Timestamp;
      endAt: Timestamp;

      createdAt: Timestamp;
      updatedAt: Timestamp;
    };

    lifeLogTreeNodes: {
      text: string;
      lifeLogId: string;

      parentId: string;
      order: string;

      createdAt: Timestamp;
      updatedAt: Timestamp;
    };
  }
}

collectionNgramConfig.lifeLogs = true;
collectionNgramConfig.lifeLogTreeNodes = true;

export enum EditingField {
  StartAt = "startAt",
  EndAt = "endAt",
  Text = "text",
}
