import type { RxQuery } from "rxdb";

import React from "react";
import { useSyncExternalStoreWithSelector } from "use-sync-external-store/with-selector";

function identity<T>(x: T): T {
  return x;
}

type State =
  | {
      result: { content: unknown };
      onStorageChanges: Set<() => void>;
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
    throw query
      .exec()
      .then((result: unknown) => {
        stateMap.set(key, {
          result: { content: result },
          onStorageChanges: new Set(),
        });
      })
      .catch((error) => {
        stateMap.set(key, { error });
      });
  }

  if ("error" in state) {
    throw state.error;
  }

  React.useEffect(() => {
    const subscription = query.$.subscribe((result) => {
      state.result = { content: result };
      state.onStorageChanges.forEach((onStorageChange) => onStorageChange());
    });

    return () => subscription.unsubscribe();
  }, [state]);

  const sub = React.useCallback(
    (onStorageChange: () => void) => {
      state.onStorageChanges.add(onStorageChange);

      return () => {
        state.onStorageChanges.delete(onStorageChange);
      };
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
