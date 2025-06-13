import { doc, type Timestamp } from "firebase/firestore";
import { Show, startTransition } from "solid-js";

import { ChildrenNodes } from "@/components/lifeLogTree";
import { getCollection, getDoc, useFirestoreService } from "@/services/firebase/firestore";
import { createSubscribeSignal } from "@/services/firebase/firestore/subscribe";
import { getFirstChildNode } from "@/services/firebase/firestore/treeNode";
import { initialState, useStoreService } from "@/services/store";
import { addKeyDownEventListener } from "@/solid/event";
import { styles } from "@/styles.css";

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
  return null;
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
        if (ctrlKey || shiftKey || isLifeLogNodeSelected$()) return;

        event.stopImmediatePropagation();

        const lifeLog = await getDoc(firestore, lifeLogsCol, props.id);
        if (!lifeLog) return;

        const firstChildNode = await getFirstChildNode(firestore, lifeLogTreeNodesCol, lifeLog);
        if (!firstChildNode) return;

        firestore.setClock(true);
        await startTransition(() => {
          try {
            setSelectedLifeLogNodeId(firstChildNode.id);
          } finally {
            firestore.setClock(false);
          }
        });

        break;
      }

      case "KeyH": {
        if (ctrlKey || shiftKey || isLifeLogSelected$()) return;
        event.stopImmediatePropagation();

        setSelectedLifeLogNodeId("");

        break;
      }
    }
  });

  return (
    <Show when={lifeLog$()}>
      {(lifeLog$) => {
        return (
          <>
            <div classList={{ [styles.lifeLogTree.selected]: isLifeLogSelected$() }}>
              <span>{lifeLog$().text}</span>
            </div>
            <Show when={selectedLifeLogNodeId$()}>
              {(selectedLifeLogNodeId$) => (
                <ChildrenNodes
                  col={getCollection(firestore, "lifeLogTreeNodes")}
                  parentId={props.id}
                  selectedId={selectedLifeLogNodeId$()}
                  setSelectedId={setSelectedLifeLogNodeId}
                  showNode={(node) => <span>{node.text}</span>}
                />
              )}
            </Show>
          </>
        );
      }}
    </Show>
  );
}
