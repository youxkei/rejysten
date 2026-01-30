import { debounce } from "@solid-primitives/scheduled";
import { Timestamp } from "firebase/firestore";
import { createEffect, createSignal, startTransition } from "solid-js";

import { awaitable } from "@/awaitableCallback";
import { getCollection, getDoc, useFirestoreService } from "@/services/firebase/firestore";
import { useStoreService } from "@/services/store";
import { noneTimestamp } from "@/timestamp";

export interface UseRangeFromFocusOptions {
  initialStart: Timestamp;
  initialEnd: Timestamp;
  rangeMs: number;
  debounceMs?: number;
}

export function useRangeFromFocus(options: UseRangeFromFocusOptions) {
  const { state } = useStoreService();
  const firestore = useFirestoreService();
  const lifeLogsCol = getCollection(firestore, "lifeLogs");

  const rangeMs = options.rangeMs;

  const [rangeStart$, setRangeStart] = createSignal(options.initialStart);
  const [rangeEnd$, setRangeEnd] = createSignal(options.initialEnd);

  const debouncedUpdateRange = debounce(
    awaitable(async (lifeLogId: string) => {
      if (!lifeLogId) return;

      const lifeLog = await getDoc(firestore, lifeLogsCol, lifeLogId);
      if (!lifeLog) return;

      const focusedEndAt = lifeLog.endAt;

      // Don't slide window for LifeLogs with noneTimestamp endAt
      // These are newly created LifeLogs that haven't had their time set yet
      if (focusedEndAt.isEqual(noneTimestamp)) return;

      // Slide window to center around focused LifeLog's endAt
      // This matches the query filter which uses endAt for filtering
      const newStart = Timestamp.fromMillis(focusedEndAt.toMillis() - rangeMs);
      const newEnd = Timestamp.fromMillis(focusedEndAt.toMillis() + rangeMs);

      await startTransition(() => {
        setRangeStart(newStart);
        setRangeEnd(newEnd);
      });
    }),
    options.debounceMs ?? 300,
  );

  createEffect(() => {
    debouncedUpdateRange(state.panesLifeLogs.selectedLifeLogId);
  });

  return {
    rangeStart$,
    rangeEnd$,
  };
}
