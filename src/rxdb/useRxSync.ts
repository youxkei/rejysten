import React from "react";

import { useSelector } from "../store";
import { useRxCollections } from "./useRxCollections";

export function useRxSync() {
  const collections = useRxCollections();
  const { domain, user, pass, syncing } = useSelector(
    (state) => state.rxdbSync
  );

  React.useEffect(() => {
    if (syncing) {
      let syncStates = [];

      for (const [collectionName, collection] of Object.entries(collections)) {
        syncStates.push(
          collection.syncCouchDB({
            remote: `https://${user}:${pass}@${domain}/${collectionName}`,
            options: {
              live: true,
              retry: true,
            },
          })
        );
      }

      return () => {
        for (const syncState of syncStates) {
          syncState.cancel();
        }
      };
    }
  }, [domain, user, pass, syncing]);
}
