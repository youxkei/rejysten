import { Timestamp } from "firebase/firestore";
import { createSignal, startTransition } from "solid-js";

import { DateNow } from "@/date";
import { getCollection, getDoc, useFirestoreService } from "@/services/firebase/firestore";
import { dayMs, noneTimestamp } from "@/timestamp";

export interface UseScrollRangeOptions {
  initialCenterMs: number;
  rangeMs?: number;
  expandMs?: number;
}

export function useScrollRange(options: UseScrollRangeOptions) {
  const firestore = useFirestoreService();
  const lifeLogsCol = getCollection(firestore, "lifeLogs");

  const rangeMs = options.rangeMs ?? 14 * dayMs;
  const expandMs = options.expandMs ?? 14 * dayMs;

  const [rangeStart$, setRangeStart] = createSignal(Timestamp.fromMillis(options.initialCenterMs - rangeMs));
  const [rangeEnd$, setRangeEnd] = createSignal(Timestamp.fromMillis(options.initialCenterMs + rangeMs));
  const [isExpanded$, setIsExpanded] = createSignal(false);
  const [isSliding$, setIsSliding] = createSignal(false);
  const [hasNoOlderData$, setHasNoOlderData] = createSignal(false);
  const [hasNoNewerData$, setHasNoNewerData] = createSignal(false);

  async function slideOlder() {
    if (isSliding$() || hasNoOlderData$()) return;
    setIsSliding(true);

    await startTransition(() => {
      setRangeStart((prev) => Timestamp.fromMillis(prev.toMillis() - expandMs));
      setIsExpanded(true);
    });

    requestAnimationFrame(() => {
      setIsSliding(false);
    });
  }

  async function slideNewer() {
    if (isSliding$() || hasNoNewerData$()) return;
    setIsSliding(true);

    await startTransition(() => {
      setRangeEnd((prev) => Timestamp.fromMillis(prev.toMillis() + expandMs));
      setIsExpanded(true);
    });

    requestAnimationFrame(() => {
      setIsSliding(false);
    });
  }

  async function resetRange(centerMs: number) {
    await startTransition(() => {
      setRangeStart(Timestamp.fromMillis(centerMs - rangeMs));
      setRangeEnd(Timestamp.fromMillis(centerMs + rangeMs));
      setIsExpanded(false);
      setHasNoOlderData(false);
      setHasNoNewerData(false);
    });
  }

  async function resetToLifeLog(lifeLogId: string) {
    const lifeLog = await getDoc(firestore, lifeLogsCol, lifeLogId);
    if (!lifeLog) return;

    const focusedEndAt = lifeLog.endAt;
    const centerMs = focusedEndAt.isEqual(noneTimestamp) ? DateNow() : focusedEndAt.toMillis();
    await resetRange(centerMs);
  }

  function markNoOlderData() {
    setHasNoOlderData(true);
  }

  function markNoNewerData() {
    setHasNoNewerData(true);
  }

  return {
    rangeStart$,
    rangeEnd$,
    isExpanded$,
    isSliding$,
    hasNoOlderData$,
    hasNoNewerData$,
    slideOlder,
    slideNewer,
    resetToLifeLog,
    markNoOlderData,
    markNoNewerData,
  };
}
