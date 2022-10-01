import type { RxQuery } from "rxdb";

import { useCallback, useMemo } from "react";
import { useSyncExternalStoreWithSelector } from "use-sync-external-store/with-selector";

function identity<T>(x: T): T {
  return x;
}

type State =
  | {
      result: { content: unknown };
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
    throw (async () => {
      try {
        stateMap.set(key, {
          result: { content: await query.exec() },
        });
      } catch (error) {
        stateMap.set(key, { error });
      }
    })();
  }

  if ("error" in state) {
    throw state.error;
  }

  const sub = useCallback(
    (onStorageChange: () => void) => {
      const subscription = query.$.subscribe((result) => {
        state.result = { content: result };
        onStorageChange();
      });

      return () => subscription.unsubscribe();
    },
    [state]
  );

  const getSnapshot = useCallback(() => state.result, [state]);
  const isEqualContent = useMemo(() => {
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
