import type { RxCouchDBReplicationState } from "rxdb";

import React from "react";

import { useSelector, useDispatch } from "../store";
import { useRxCollections } from "./useRxCollections";
import { rxdbSync } from "../slice/rxdbSync";
import { toSnakeCase } from "js-convert-case";

export function useRxSync() {
  const dispatch = useDispatch();
  const collections = useRxCollections();
  const { domain, user, pass, syncing } = useSelector(
    (state) => state.rxdbSync
  );

  React.useEffect(() => {
    if (syncing) {
      const syncStates = [] as RxCouchDBReplicationState[];

      for (const [collectionName, collection] of Object.entries(collections)) {
        const collectionNameSnakeCase = toSnakeCase(collectionName);

        const syncState = collection.syncCouchDB({
          remote: `https://${user}:${pass}@${domain}/${collectionNameSnakeCase}`,
          options: {
            live: true,
            retry: true,
          },
        });

        syncState.error$.subscribe((error) => {
          dispatch(
            rxdbSync.actions.syncError({ error: `${collectionName}: ${error}` })
          );
        });

        syncStates.push(syncState);
      }

      return () => {
        for (const syncState of syncStates) {
          syncState.cancel();
        }
      };
    }
  }, [domain, user, pass, syncing]);
}
