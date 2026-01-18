import { Key } from "@solid-primitives/keyed";
import equal from "fast-deep-equal";
import { orderBy, query, Timestamp, where } from "firebase/firestore";
import { createMemo, createSignal } from "solid-js";

import { DateNow, TimestampNow } from "@/date";
import { LifeLogTree } from "@/panes/lifeLogs/LifeLogTree";
import { MobileToolbar } from "@/panes/lifeLogs/MobileToolbar";
import { EditingField } from "@/panes/lifeLogs/schema";
import { useRangeFromFocus } from "@/panes/lifeLogs/useRangeFromFocus";
import { getCollection, useFirestoreService } from "@/services/firebase/firestore";
import { createSubscribeAllSignal } from "@/services/firebase/firestore/subscribe";
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
    <>
      <ScrollContainer class={styles.lifeLogs.container}>
        <TimeRangedLifeLogs start={rangeStart$()} end={rangeEnd$()} />
      </ScrollContainer>
      <MobileToolbar />
    </>
  );
}

export function TimeRangedLifeLogs(props: { start: Timestamp; end: Timestamp }) {
  const firestore = useFirestoreService();
  const lifeLogsCol = getCollection(firestore, "lifeLogs");

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
        where("startAt", ">=", props.start),
        where("startAt", "<=", props.end.valueOf() <= TimestampNow().valueOf() ? props.end : noneTimestamp),
        orderBy("startAt"),
        orderBy("endAt"),
      ),
    () => `toplevel life logs (range)`,
  );

  const lifeLogs$ = rangeLifeLogs$;

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
        {(lifeLogWithNeighborIds) => (
          <li id={lifeLogWithNeighborIds().id} class={styles.lifeLogs.listItem}>
            <LifeLogTree
              id={lifeLogWithNeighborIds().id}
              prevId={lifeLogWithNeighborIds().prevId}
              nextId={lifeLogWithNeighborIds().nextId}
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
        )}
      </Key>
    </ul>
  );
}
