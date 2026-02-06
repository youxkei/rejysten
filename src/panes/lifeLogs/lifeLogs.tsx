import { Key } from "@solid-primitives/keyed";
import equal from "fast-deep-equal";
import { orderBy, query, Timestamp, where } from "firebase/firestore";
import { createEffect, createMemo, createSignal, onCleanup, onMount } from "solid-js";

interface VirtualKeyboard extends EventTarget {
  overlaysContent: boolean;
  boundingRect: DOMRect;
}

declare global {
  interface Navigator {
    virtualKeyboard?: VirtualKeyboard;
  }
}

import { DateNow, TimestampNow } from "@/date";
import { LifeLog } from "@/panes/lifeLogs/lifeLog";
import { MobileToolbar } from "@/panes/lifeLogs/mobileToolbar";
import { EditingField } from "@/panes/lifeLogs/schema";
import { useRangeFromFocus } from "@/panes/lifeLogs/useRangeFromFocus";
import { useScrollFocus } from "@/panes/lifeLogs/useScrollFocus";
import { useActionsService } from "@/services/actions";
import { getCollection, useFirestoreService } from "@/services/firebase/firestore";
import { createSubscribeAllSignal } from "@/services/firebase/firestore/subscribe";
import { addKeyDownEventListener } from "@/solid/event";
import { ScrollContainer } from "@/solid/scroll";
import { styles } from "@/styles.css";
import { dayMs, noneTimestamp } from "@/timestamp";

export interface LifeLogsProps {
  rangeMs?: number;
  debounceMs?: number;
}

export function LifeLogs(props: LifeLogsProps = {}) {
  const rangeMs = props.rangeMs ?? 7 * dayMs;

  const { rangeStart$, rangeEnd$ } = useRangeFromFocus({
    initialStart: Timestamp.fromMillis(DateNow() - rangeMs),
    initialEnd: Timestamp.fromMillis(DateNow() + rangeMs),
    rangeMs,
    debounceMs: props.debounceMs ?? 300,
  });

  return (
    <div class={styles.lifeLogs.wrapper}>
      <ScrollContainer class={styles.lifeLogs.container}>
        <TimeRangedLifeLogs start={rangeStart$()} end={rangeEnd$()} scrollFocusDebounceMs={props.debounceMs} />
      </ScrollContainer>
      <MobileToolbar />
    </div>
  );
}

export function TimeRangedLifeLogs(props: { start: Timestamp; end: Timestamp; scrollFocusDebounceMs?: number }) {
  const firestore = useFirestoreService();
  const lifeLogsCol = getCollection(firestore, "lifeLogs");
  const actions = useActionsService().panes.lifeLogs;

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

  // スクロール時のフォーカス移動 + レンジ再センタリング時のスクロール位置補正
  useScrollFocus({
    lifeLogIds$: () => lifeLogs$().map((l) => l.id),
    isEditing$,
    debounceMs: props.scrollFocusDebounceMs,
  });

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
