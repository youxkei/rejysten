import { Key } from "@solid-primitives/keyed";
import equal from "fast-deep-equal";
import { orderBy, query, Timestamp, where } from "firebase/firestore";
import { createMemo, createSignal } from "solid-js";

import { LifeLogTree } from "@/panes/lifeLogs/LifeLogTree";
import { EditingField } from "@/panes/lifeLogs/schema";
import { getCollection, useFirestoreService } from "@/services/firebase/firestore";
import { createSubscribeAllSignal } from "@/services/firebase/firestore/subscribe";
import { ScrollContainer } from "@/solid/scroll";
import { createTickSignal } from "@/solid/signal";
import { styles } from "@/styles.css";
import { dayMs, noneTimestamp } from "@/timestamp";

// Re-export for external use
export { EditingField } from "./schema";
export { LifeLogTree } from "./LifeLogTree";

export function LifeLogs() {
  const tickDay$ = createTickSignal(dayMs);

  return (
    <ScrollContainer class={styles.lifeLogs.container}>
      <TimeRangedLifeLogs start={Timestamp.fromMillis(tickDay$() - 7 * dayMs)} end={noneTimestamp} />
    </ScrollContainer>
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

  const lifeLogs$ = createSubscribeAllSignal(
    firestore,
    () =>
      query(
        lifeLogsCol,
        where("startAt", ">=", props.start),
        where("endAt", "<=", props.end),
        orderBy("startAt"),
        orderBy("endAt"),
      ),
    () => `toplevel life logs`,
  );

  const lifeLogIdWithNeighborIds$ = createMemo(
    () => {
      const lifeLogs = lifeLogs$();
      const lifeLogWithNeighborIds = lifeLogs.map((lifeLog) => ({ id: lifeLog.id, prevId: "", nextId: "" }));

      for (let i = 0; i < lifeLogs.length; i++) {
        if (i > 0) {
          lifeLogWithNeighborIds[i].prevId = lifeLogs[i - 1].id;
        }
        if (i < lifeLogs.length - 1) {
          lifeLogWithNeighborIds[i].nextId = lifeLogs[i + 1].id;
        }
      }

      return lifeLogWithNeighborIds;
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
