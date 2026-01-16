import { debounce } from "@solid-primitives/scheduled";
import { Timestamp } from "firebase/firestore";
import { createEffect, createSignal, on } from "solid-js";

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

  const debouncedUpdateRange = debounce(async (lifeLogId: string) => {
    if (!lifeLogId) return;

    const lifeLog = await getDoc(firestore, lifeLogsCol, lifeLogId);
    if (!lifeLog) return;

    const focusedStartAt = lifeLog.startAt;

    // Don't slide window for LifeLogs with noneTimestamp startAt
    // These are newly created LifeLogs that haven't had their time set yet
    if (focusedStartAt.isEqual(noneTimestamp)) return;

    // Slide window to center around focused LifeLog's startAt
    const newStart = Timestamp.fromMillis(focusedStartAt.toMillis() - rangeMs);
    const newEnd = Timestamp.fromMillis(focusedStartAt.toMillis() + rangeMs);

    setRangeStart(newStart);
    setRangeEnd(newEnd);
  }, options.debounceMs ?? 300);

  createEffect(
    on(
      () => state.panesLifeLogs.selectedLifeLogId,
      (lifeLogId) => {
        debouncedUpdateRange(lifeLogId);
      },
      { defer: true },
    ),
  );

  return {
    rangeStart$,
    rangeEnd$,
  };
}
