import { debounce } from "@solid-primitives/scheduled";
import { Timestamp } from "firebase/firestore";
import { createEffect, createSignal, startTransition } from "solid-js";

import { awaitable } from "@/awaitableCallback";
import { DateNow } from "@/date";
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
      const centerMs = focusedEndAt.isEqual(noneTimestamp) ? DateNow() : focusedEndAt.toMillis();
      const newStart = Timestamp.fromMillis(centerMs - rangeMs);
      const newEnd = Timestamp.fromMillis(centerMs + rangeMs);

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
