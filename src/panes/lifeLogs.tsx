import { Key } from "@solid-primitives/keyed";
import equal from "fast-deep-equal";
import { doc, orderBy, query, Timestamp, where } from "firebase/firestore";
import { createMemo, Show, startTransition } from "solid-js";
import { uuidv4 } from "uuidv7";

import { ChildrenNodes } from "@/components/lifeLogTree";
import { getCollection, getDoc, useFirestoreService } from "@/services/firebase/firestore";
import { runBatch } from "@/services/firebase/firestore/batch";
import { createSubscribeAllSignal, createSubscribeSignal } from "@/services/firebase/firestore/subscribe";
import { addSingle, getFirstChildNode } from "@/services/firebase/firestore/treeNode";
import { initialState, useStoreService } from "@/services/store";
import { addKeyDownEventListener } from "@/solid/event";
import { createTickSignal } from "@/solid/signal";
import { styles } from "@/styles.css";
import { dayMs, noneTimestamp, timestampToTimeText } from "@/timestamp";

declare module "@/services/store" {
  interface State {
    panesLifeLogs: {
      selectedLifeLogId: string;
      selectedLifeLogNodeId: string;
    };
  }
}

declare module "@/services/firebase/firestore/schema" {
  interface Schema {
    lifeLogs: {
      text: string;

      startAt: Timestamp;
      endAt: Timestamp;

      createdAt: Timestamp;
      updatedAt: Timestamp;
    };

    lifeLogTreeNodes: {
      text: string;

      parentId: string;
      prevId: string;
      nextId: string;
      aboveId: string;
      belowId: string;

      createdAt: Timestamp;
      updatedAt: Timestamp;
    };
  }
}

initialState.panesLifeLogs = {
  selectedLifeLogId: "",
  selectedLifeLogNodeId: "",
};

export function LifeLogs() {
  const tickDay$ = createTickSignal(dayMs);

  return <LifeLogList start={Timestamp.fromMillis(tickDay$() - 7 * dayMs)} end={noneTimestamp} />;
}

export function LifeLogList(props: { start: Timestamp; end: Timestamp }) {
  const firestore = useFirestoreService();
  const lifeLogsCol = getCollection(firestore, "lifeLogs");

  const lifeLogs$ = createSubscribeAllSignal(firestore, () =>
    query(
      lifeLogsCol,
      where("startAt", ">=", props.start),
      where("endAt", "<=", props.end),
      orderBy("startAt"),
      orderBy("endAt"),
    ),
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

  return (
    <ul>
      <Key each={lifeLogIdWithNeighborIds$()} by={(item) => item.id}>
        {(lifeLogWithNeighborIds) => (
          <li id={lifeLogWithNeighborIds().id}>
            <LifeLogTree
              id={lifeLogWithNeighborIds().id}
              prevId={lifeLogWithNeighborIds().prevId}
              nextId={lifeLogWithNeighborIds().nextId}
            />
          </li>
        )}
      </Key>
    </ul>
  );
}

export function LifeLogTree(props: { id: string; prevId: string; nextId: string }) {
  const firestore = useFirestoreService();
  const { state, updateState } = useStoreService();

  const lifeLogsCol = getCollection(firestore, "lifeLogs");
  const lifeLogTreeNodesCol = getCollection(firestore, "lifeLogTreeNodes");
  const lifeLog$ = createSubscribeSignal(firestore, () => doc(lifeLogsCol, props.id));

  const selectedLifeLogNodeId$ = () => state.panesLifeLogs.selectedLifeLogNodeId;
  const setSelectedLifeLogNodeId = (selectedLifeLogNodeId: string) => {
    updateState((state) => {
      state.panesLifeLogs.selectedLifeLogNodeId = selectedLifeLogNodeId;
    });
  };

  const isSelected$ = () => state.panesLifeLogs.selectedLifeLogId === props.id;
  const isLifeLogSelected$ = () => isSelected$() && selectedLifeLogNodeId$() === "";
  const isLifeLogNodeSelected$ = () => isSelected$() && selectedLifeLogNodeId$() !== "";

  addKeyDownEventListener(async (event) => {
    const { shiftKey, ctrlKey } = event;

    switch (event.code) {
      case "KeyL": {
        if (ctrlKey || shiftKey || !isSelected$() || isLifeLogNodeSelected$()) return;

        event.stopImmediatePropagation();

        const lifeLog = await getDoc(firestore, lifeLogsCol, props.id);
        if (!lifeLog) return;

        const firstChildNode = await getFirstChildNode(firestore, lifeLogTreeNodesCol, lifeLog);
        let id = "";

        firestore.setClock(true);
        try {
          if (firstChildNode) {
            id = firstChildNode.id;
          } else {
            id = uuidv4();
            await runBatch(firestore, (batch) => {
              addSingle(firestore, batch, lifeLogTreeNodesCol, lifeLog.id, {
                id,
                text: "new",
              });

              return Promise.resolve();
            });
          }
        } finally {
          await startTransition(() => {
            setSelectedLifeLogNodeId(id);
            firestore.setClock(false);
          });
        }

        break;
      }

      case "KeyH": {
        if (ctrlKey || shiftKey || !isSelected$() || isLifeLogSelected$()) return;
        event.stopImmediatePropagation();

        setSelectedLifeLogNodeId("");

        break;
      }

      case "KeyJ": {
        if (ctrlKey || shiftKey || !isSelected$() || isLifeLogNodeSelected$() || props.nextId === "") return;
        event.stopImmediatePropagation();

        updateState((state) => {
          state.panesLifeLogs.selectedLifeLogId = props.nextId;
        });

        break;
      }

      case "KeyK": {
        if (ctrlKey || shiftKey || !isSelected$() || isLifeLogNodeSelected$() || props.prevId === "") return;
        event.stopImmediatePropagation();

        updateState((state) => {
          state.panesLifeLogs.selectedLifeLogId = props.prevId;
        });

        break;
      }
    }
  });

  return (
    <Show when={lifeLog$()}>
      {(lifeLog$) => (
        <>
          <div classList={{ [styles.lifeLogTree.selected]: isLifeLogSelected$() }}>
            <div>
              {timestampToTimeText(lifeLog$().startAt) ?? "N/A"} {timestampToTimeText(lifeLog$().endAt) ?? "N/A"}
            </div>
            <div> {lifeLog$().text} </div>
          </div>
          <Show when={isLifeLogNodeSelected$()}>
            <ChildrenNodes
              col={getCollection(firestore, "lifeLogTreeNodes")}
              parentId={props.id}
              selectedId={selectedLifeLogNodeId$()}
              setSelectedId={setSelectedLifeLogNodeId}
              showNode={(node) => <span>{node.text}</span>}
            />
          </Show>
        </>
      )}
    </Show>
  );
}
