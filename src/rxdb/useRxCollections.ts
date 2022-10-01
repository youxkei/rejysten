import type { Collections } from "@/rxdb/collections";

import { useRxDatabase } from "@/rxdb/useRxDatabase";
import { collectionCreators } from "@/rxdb/collections";

let collections: Collections | undefined;
let error: unknown;

export function useRxCollections(): Collections {
  if (error !== undefined) {
    throw error;
  }

  if (collections !== undefined) {
    return collections;
  }

  const db = useRxDatabase();

  throw (async () => {
    try {
      collections = await db.addCollections(collectionCreators);
    } catch (err) {
      error = err;
    }
  })();
}
