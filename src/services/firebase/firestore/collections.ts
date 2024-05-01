import type { FirebaseService } from "@/services/firebase";
import type { CollectionReference } from "firebase/firestore";

import { collection } from "firebase/firestore";

export type Collections = {
  pocFirestoreNgram: {
    text: string;
  };

  pocFirestorePubsub: {
    prevId: string;
    nextId: string;
  };

  pocFirestoreSubcollection: {
    text: string;
  };

  ngrams: {
    collection: Exclude<keyof Collections, "ngram">;
    text: string;
    ngram: Record<string, true>;
  };
};

export function getCollection<Name extends keyof Collections>(service: FirebaseService, name: Name) {
  return collection(service.firestore, name) as CollectionReference<Collections[Name]>;
}
