import { Key } from "@solid-primitives/keyed";
import { debounce } from "@solid-primitives/scheduled";
import equal from "fast-deep-equal";
import { orderBy, query, type Timestamp, where } from "firebase/firestore";
import { createEffect, createMemo, createSignal, on, onCleanup, onMount, untrack } from "solid-js";

interface VirtualKeyboard extends EventTarget {
  overlaysContent: boolean;
  boundingRect: DOMRect;
}

declare global {
  interface Navigator {
    virtualKeyboard?: VirtualKeyboard;
  }
}

import { awaitable } from "@/awaitableCallback";
import { DateNow, TimestampNow } from "@/date";
import { LifeLog } from "@/panes/lifeLogs/lifeLog";
import { MobileToolbar } from "@/panes/lifeLogs/mobileToolbar";
import { EditingField } from "@/panes/lifeLogs/schema";
import { useScrollFocus } from "@/panes/lifeLogs/useScrollFocus";
import { useScrollRange } from "@/panes/lifeLogs/useScrollRange";
import { useActionsService } from "@/services/actions";
import { getCollection, useFirestoreService } from "@/services/firebase/firestore";
import { createSubscribeAllSignal } from "@/services/firebase/firestore/subscribe";
import { useStoreService } from "@/services/store";
import { addKeyDownEventListener } from "@/solid/event";
import { createIsMobile } from "@/solid/responsive";
import { ScrollContainer, useScrollContainer } from "@/solid/scroll";
import { styles } from "@/styles.css";
import { dayMs, noneTimestamp } from "@/timestamp";

export interface LifeLogsProps {
  rangeMs?: number;
  debounceMs?: number;
}

export function LifeLogs(props: LifeLogsProps = {}) {
  const rangeMs = props.rangeMs ?? 14 * dayMs;

  const scrollRange = useScrollRange({
    initialCenterMs: DateNow(),
    rangeMs,
  });

  return (
    <div class={styles.lifeLogs.wrapper}>
      <ScrollContainer class={styles.lifeLogs.container}>
        <TimeRangedLifeLogs
          start={scrollRange.rangeStart$()}
          end={scrollRange.rangeEnd$()}
          isExpanded={scrollRange.isExpanded$()}
          isSliding={scrollRange.isSliding$()}
          slideOlder={scrollRange.slideOlder}
          slideNewer={scrollRange.slideNewer}
          resetToLifeLog={scrollRange.resetToLifeLog}
          markNoOlderData={scrollRange.markNoOlderData}
          markNoNewerData={scrollRange.markNoNewerData}
          hasNoOlderData={scrollRange.hasNoOlderData$()}
          hasNoNewerData={scrollRange.hasNoNewerData$()}
          scrollFocusDebounceMs={props.debounceMs}
        />
      </ScrollContainer>
      <MobileToolbar />
    </div>
  );
}

export function TimeRangedLifeLogs(props: {
  start: Timestamp;
  end: Timestamp;
  isExpanded: boolean;
  isSliding: boolean;
  slideOlder: () => Promise<void>;
  slideNewer: () => Promise<void>;
  resetToLifeLog: (lifeLogId: string) => Promise<void>;
  markNoOlderData: () => void;
  markNoNewerData: () => void;
  hasNoOlderData: boolean;
  hasNoNewerData: boolean;
  scrollFocusDebounceMs?: number;
}) {
  const firestore = useFirestoreService();
  const lifeLogsCol = getCollection(firestore, "lifeLogs");
  const actions = useActionsService().panes.lifeLogs;
  const { state } = useStoreService();
  const container$ = useScrollContainer();
  const isMobile$ = createIsMobile();

  const [editingField$, setEditingField] = createSignal<EditingField>(EditingField.Text);
  const [isEditing$, setIsEditing] = createSignal(false);

  // Track cursor position for LifeLog text after deletion
  const [lifeLogCursorInfo$, setLifeLogCursorInfo] = createSignal<
    { lifeLogId: string; cursorPosition: number } | undefined
  >(undefined);

  // Query for LifeLogs within the time range
  const rangeLifeLogs$ = createSubscribeAllSignal(
    firestore,
    () =>
      query(
        lifeLogsCol,
        where("endAt", ">=", props.start),
        where("endAt", "<=", props.end.valueOf() <= TimestampNow().valueOf() ? props.end : noneTimestamp),
        orderBy("endAt"),
        orderBy("startAt"),
      ),
    () => `toplevel life logs (range)`,
  );

  const lifeLogs$ = rangeLifeLogs$;

  // スクロール位置補正（レンジ変更時）
  useScrollFocus({
    lifeLogIds$: () => lifeLogs$().map((l) => l.id),
  });

  // selectedId変更時のresetRange (展開中 or 範囲外)
  const debouncedResetToSelected = debounce(
    awaitable(async (lifeLogId: string) => {
      await props.resetToLifeLog(lifeLogId);
    }),
    props.scrollFocusDebounceMs ?? 300,
  );

  createEffect(() => {
    const selectedId = state.panesLifeLogs.selectedLifeLogId;
    if (!selectedId) return;
    const currentIds = untrack(() => lifeLogs$().map((l) => l.id));
    if (currentIds.includes(selectedId) && !untrack(() => props.isExpanded)) return;
    debouncedResetToSelected(selectedId);
  });

  // スクロールによるレンジ展開
  const handleScroll = () => {
    if (isEditing$()) return;
    if (props.isSliding) return;

    const container = container$();
    if (!container) return;

    const isAtTop = container.scrollTop <= 1;
    const isAtBottom = container.scrollTop + container.clientHeight >= container.scrollHeight - 1;

    const isMobile = isMobile$();

    if (isAtTop) {
      if (isMobile) {
        if (!props.hasNoNewerData) void trackingSlideNewer();
      } else {
        if (!props.hasNoOlderData) void trackingSlideOlder();
      }
    } else if (isAtBottom) {
      if (isMobile) {
        if (!props.hasNoOlderData) void trackingSlideOlder();
      } else {
        if (!props.hasNoNewerData) void trackingSlideNewer();
      }
    }
  };

  createEffect(() => {
    const container = container$();
    if (!container) return;

    container.addEventListener("scroll", handleScroll);
    onCleanup(() => {
      container.removeEventListener("scroll", handleScroll);
    });
  });

  // データ終端検出: 展開方向に対応するエッジのみチェック
  let prevOldestId: string | undefined;
  let prevNewestId: string | undefined;
  let lastSlideDirection: "older" | "newer" | undefined;

  const originalSlideOlder = props.slideOlder;
  const originalSlideNewer = props.slideNewer;
  const trackingSlideOlder = async () => { lastSlideDirection = "older"; await originalSlideOlder(); };
  const trackingSlideNewer = async () => { lastSlideDirection = "newer"; await originalSlideNewer(); };

  createEffect(
    on(
      () => lifeLogs$(),
      (logs) => {
        if (logs.length === 0) return;

        const oldestId = logs[0].id;
        const newestId = logs[logs.length - 1].id;

        if (lastSlideDirection === "older" && prevOldestId !== undefined && oldestId === prevOldestId) {
          props.markNoOlderData();
        }
        if (lastSlideDirection === "newer" && prevNewestId !== undefined && newestId === prevNewestId) {
          props.markNoNewerData();
        }

        lastSlideDirection = undefined;
        prevOldestId = oldestId;
        prevNewestId = newestId;
      },
    ),
  );

  // 仮想キーボード表示時に編集中の要素をビューポート内にスクロール
  const scrollFocusedElementIntoView = () => {
    const focused = document.activeElement;
    if (focused && focused instanceof HTMLElement) {
      focused.scrollIntoView({ block: "center", behavior: "instant" });
    }
  };

  createEffect(() => {
    if (isEditing$()) {
      // 編集開始時に、次のフレームでフォーカス要素をスクロール
      requestAnimationFrame(() => {
        scrollFocusedElementIntoView();
      });
    }
  });

  onMount(() => {
    const vk = navigator.virtualKeyboard;
    if (vk) {
      const handleGeometryChange = () => {
        if (isEditing$()) {
          scrollFocusedElementIntoView();
        }
      };
      vk.addEventListener("geometrychange", handleGeometryChange);
      onCleanup(() => {
        vk.removeEventListener("geometrychange", handleGeometryChange);
      });
    }
  });

  // Handle "o" key when there are 0 lifeLogs
  addKeyDownEventListener((event) => {
    if (event.isComposing || event.ctrlKey) return;
    if (lifeLogs$().length > 0) return;
    if (event.code !== "KeyO") return;

    event.preventDefault();
    event.stopImmediatePropagation();

    actions.createFirstLifeLog();
  });

  const lifeLogIdWithNeighborIds$ = createMemo(
    () => {
      const lifeLogs = lifeLogs$();

      const lifeLogsWithNeighborIds = lifeLogs.map((lifeLog) => ({
        id: lifeLog.id,
        prevId: "",
        nextId: "",
      }));

      for (let i = 0; i < lifeLogs.length; i++) {
        if (i > 0) {
          lifeLogsWithNeighborIds[i].prevId = lifeLogs[i - 1].id;
        }
        if (i < lifeLogs.length - 1) {
          lifeLogsWithNeighborIds[i].nextId = lifeLogs[i + 1].id;
        }
      }

      return lifeLogsWithNeighborIds;
    },
    { equal },
  );

  const firstLifeLogId$ = createMemo(() => {
    const lifeLogs = lifeLogs$();
    return lifeLogs.length > 0 ? lifeLogs[0].id : "";
  });

  const lastLifeLogId$ = createMemo(() => {
    const lifeLogs = lifeLogs$();
    return lifeLogs.length > 0 ? lifeLogs[lifeLogs.length - 1].id : "";
  });

  return (
    <ul class={styles.lifeLogs.list}>
      <Key each={lifeLogIdWithNeighborIds$()} by={(item) => item.id}>
        {(lifeLogWithNeighborIds$) => {
          const id$ = createMemo(() => lifeLogWithNeighborIds$().id);
          const prevId$ = createMemo(() => lifeLogWithNeighborIds$().prevId);
          const nextId$ = createMemo(() => lifeLogWithNeighborIds$().nextId);

          return (
            <li id={id$()} class={styles.lifeLogs.listItem}>
              <LifeLog
                id={id$()}
                prevId={prevId$()}
                nextId={nextId$()}
                firstId={firstLifeLogId$()}
                lastId={lastLifeLogId$()}
                isEditing={isEditing$()}
                setIsEditing={setIsEditing}
                editingField={editingField$()}
                setEditingField={setEditingField}
                lifeLogCursorInfo$={lifeLogCursorInfo$}
                setLifeLogCursorInfo={setLifeLogCursorInfo}
              />
            </li>
          );
        }}
      </Key>
    </ul>
  );
}
