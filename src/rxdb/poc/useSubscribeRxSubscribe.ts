import type { RxQuery } from "rxdb";

import React, { useEffect } from "react";
import { useSyncExternalStoreWithSelector } from "use-sync-external-store/with-selector";

function identity<T>(x: T): T {
  return x;
}

type State =
  | {
      result: { content: unknown };
      resolved: boolean;
      onStorageChanges: Set<() => void>;
      unsubscribe: (() => void) | undefined;
    }
  | {
      error: unknown;
    };
const stateMap: Map<string, State> = new Map();

export function useRxSubscribe<T>(
  key: string,
  query: RxQuery<any, T>,
  isEqual?: (lhs: T, rhs: T) => boolean
): T {
  const state = stateMap.get(key);

  if (state === undefined) {
    console.log("throw", key);
    throw (async () => {
      try {
        await new Promise((resolve) => {
          const state: State = {
            result: { content: undefined },
            resolved: false,
            onStorageChanges: new Set(),
            unsubscribe: undefined,
          };

          const subscription = query.$.subscribe((result) => {
            state.result = { content: result };
            console.log("subscribe", key, result, stateMap);
            state.onStorageChanges.forEach((onStorageChanges) =>
              onStorageChanges()
            );

            if (!state.resolved) {
              console.log("resolve", key);
              resolve(undefined);
              state.resolved = true;
            }
          });

          state.unsubscribe = () => subscription.unsubscribe();

          stateMap.set(key, state);
        });
      } catch (error) {
        stateMap.set(key, { error });
      }
    })();
  }

  if ("error" in state) {
    throw state.error;
  }

  useEffect(() => {
    return () => {
      state.unsubscribe?.();
      stateMap.delete(key);
    };
  }, [state]);

  const sub = React.useCallback(
    (onStorageChange: () => void) => {
      state.onStorageChanges.add(onStorageChange);

      return () => state.onStorageChanges.delete(onStorageChange);
    },
    [state]
  );

  const getSnapshot = React.useCallback(() => state.result, [state]);
  const isEqualContent = React.useMemo(() => {
    if (isEqual) {
      return (lhs: { content: T }, rhs: { content: T }) =>
        isEqual(lhs.content, rhs.content);
    } else {
      return undefined;
    }
  }, [isEqual]);

  return useSyncExternalStoreWithSelector(
    sub,
    getSnapshot,
    undefined,
    identity,
    isEqualContent
  ).content as T;
}

