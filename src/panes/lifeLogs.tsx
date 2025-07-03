import { Key } from "@solid-primitives/keyed";
import equal from "fast-deep-equal";
import { doc, orderBy, query, Timestamp, where } from "firebase/firestore";
import { createMemo, createSignal, Show, startTransition } from "solid-js";
import { uuidv4 } from "uuidv7";

import { EditableValue } from "@/components/EditableValue";
import { ChildrenNodes } from "@/components/tree";
import { getCollection, getDoc, useFirestoreService } from "@/services/firebase/firestore";
import { runBatch, updateDoc } from "@/services/firebase/firestore/batch";
import { collectionNgramConfig } from "@/services/firebase/firestore/ngram";
import { createSubscribeAllSignal, createSubscribeSignal } from "@/services/firebase/firestore/subscribe";
import { addSingle, getFirstChildNode } from "@/services/firebase/firestore/treeNode";
import { initialState, useStoreService } from "@/services/store";
import { addKeyDownEventListener } from "@/solid/event";
import { createTickSignal } from "@/solid/signal";
import { styles } from "@/styles.css";
import { dayMs, noneTimestamp, timestampToTimeText, timeTextToTimestamp } from "@/timestamp";

declare module "@/services/store" {
  interface State {
    panesLifeLogs: {
      selectedLifeLogId: string;
      selectedLifeLogNodeId: string;
    };
  }
}

initialState.panesLifeLogs = {
  selectedLifeLogId: "",
  selectedLifeLogNodeId: "",
};

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

collectionNgramConfig.lifeLogs = true;
collectionNgramConfig.lifeLogTreeNodes = true;

export function LifeLogs() {
  const tickDay$ = createTickSignal(dayMs);

  return (
    <div class={styles.lifeLogs.container}>
      <TimeRangedLifeLogs start={Timestamp.fromMillis(tickDay$() - 7 * dayMs)} end={noneTimestamp} />
    </div>
  );
}

export function TimeRangedLifeLogs(props: { start: Timestamp; end: Timestamp }) {
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
    <ul class={styles.lifeLogs.list}>
      <Key each={lifeLogIdWithNeighborIds$()} by={(item) => item.id}>
        {(lifeLogWithNeighborIds) => (
          <li id={lifeLogWithNeighborIds().id} class={styles.lifeLogs.listItem}>
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

enum EditingField {
  None = "none",
  StartAt = "startAt",
  EndAt = "endAt",
  Text = "text",
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
  const isLifeLogTreeFocused$ = () => isSelected$() && selectedLifeLogNodeId$() !== "";

  const [isEditing$, setIsEditing] = createSignal(false);
  const [editingField$, setEditingField] = createSignal<EditingField>(EditingField.None);

  addKeyDownEventListener(async (event) => {
    const { shiftKey, ctrlKey, isComposing } = event;

    if (isEditing$() || editingField$() !== EditingField.None || isComposing || !isSelected$()) return;

    switch (event.code) {
      case "KeyL": {
        if (ctrlKey || shiftKey || isLifeLogTreeFocused$()) return;

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
        if (ctrlKey || shiftKey || isLifeLogSelected$()) return;
        event.stopImmediatePropagation();

        setSelectedLifeLogNodeId("");

        break;
      }

      case "KeyJ": {
        if (ctrlKey || shiftKey || isLifeLogTreeFocused$() || props.nextId === "") return;
        event.stopImmediatePropagation();

        updateState((state) => {
          state.panesLifeLogs.selectedLifeLogId = props.nextId;
        });

        break;
      }

      case "KeyK": {
        if (ctrlKey || shiftKey || isLifeLogTreeFocused$() || props.prevId === "") return;
        event.stopImmediatePropagation();

        updateState((state) => {
          state.panesLifeLogs.selectedLifeLogId = props.prevId;
        });

        break;
      }
    }
  });

  async function saveStartAt(newTimestamp: Timestamp) {
    firestore.setClock(true);
    try {
      await runBatch(firestore, (batch) => {
        updateDoc(firestore, batch, lifeLogsCol, {
          id: props.id,
          startAt: newTimestamp,
        });
        return Promise.resolve();
      });
    } finally {
      await startTransition(() => {
        firestore.setClock(false);
      });
    }
  }

  async function saveEndAt(newTimestamp: Timestamp) {
    firestore.setClock(true);
    try {
      await runBatch(firestore, (batch) => {
        updateDoc(firestore, batch, lifeLogsCol, {
          id: props.id,
          endAt: newTimestamp,
        });
        return Promise.resolve();
      });
    } finally {
      await startTransition(() => {
        firestore.setClock(false);
      });
    }
  }

  async function saveText(newText: string) {
    firestore.setClock(true);
    try {
      await runBatch(firestore, (batch) => {
        updateDoc(firestore, batch, lifeLogsCol, {
          id: props.id,
          text: newText,
        });
        return Promise.resolve();
      });
    } finally {
      await startTransition(() => {
        firestore.setClock(false);
      });
    }
  }

  function handleTabNavigation(shiftKey: boolean) {
    const fields = [EditingField.Text, EditingField.StartAt, EditingField.EndAt];
    const currentIndex = fields.indexOf(editingField$());

    if (shiftKey) {
      // Shift+Tab: go to previous field
      const nextIndex = currentIndex > 0 ? currentIndex - 1 : fields.length - 1;
      setEditingField(fields[nextIndex]);
    } else {
      // Tab: go to next field
      const nextIndex = currentIndex < fields.length - 1 ? currentIndex + 1 : 0;
      setEditingField(fields[nextIndex]);
    }
  }

  return (
    <Show when={lifeLog$()}>
      {(lifeLog$) => (
        <>
          <div class={styles.lifeLogTree.container} classList={{ [styles.lifeLogTree.selected]: isLifeLogSelected$() }}>
            <div class={styles.lifeLogTree.timeRange}>
              <EditableValue
                value={lifeLog$().startAt}
                onSave={saveStartAt}
                isSelected={isLifeLogSelected$()}
                isEditing={editingField$() === EditingField.StartAt}
                setIsEditing={(editing) => setEditingField(editing ? EditingField.StartAt : EditingField.None)}
                toText={(ts) => timestampToTimeText(ts) ?? "N/A"}
                fromText={timeTextToTimestamp}
                editInputClassName={styles.lifeLogTree.editInput}
                onTabPress={handleTabNavigation}
              />
              <span>-</span>
              <EditableValue
                value={lifeLog$().endAt}
                onSave={saveEndAt}
                isSelected={isLifeLogSelected$()}
                isEditing={editingField$() === EditingField.EndAt}
                setIsEditing={(editing) => setEditingField(editing ? EditingField.EndAt : EditingField.None)}
                toText={(ts) => timestampToTimeText(ts) ?? "N/A"}
                fromText={timeTextToTimestamp}
                editInputClassName={styles.lifeLogTree.editInput}
                onTabPress={handleTabNavigation}
              />
            </div>
            <EditableValue
              value={lifeLog$().text}
              onSave={saveText}
              isSelected={isLifeLogSelected$()}
              isEditing={editingField$() === EditingField.Text}
              setIsEditing={(editing) => setEditingField(editing ? EditingField.Text : EditingField.None)}
              toText={(text) => text}
              fromText={(text) => text}
              className={styles.lifeLogTree.text}
              editInputClassName={styles.lifeLogTree.editInput}
              onTabPress={handleTabNavigation}
            />
          </div>
          <Show when={isLifeLogTreeFocused$()}>
            <div class={styles.lifeLogTree.childrenNodes}>
              <ChildrenNodes
                col={getCollection(firestore, "lifeLogTreeNodes")}
                parentId={props.id}
                selectedId={selectedLifeLogNodeId$()}
                setSelectedId={setSelectedLifeLogNodeId}
                isEditing={isEditing$}
                showNode={(node$, isSelected$) => {
                  async function onSaveNode(newText: string) {
                    firestore.setClock(true);
                    try {
                      await runBatch(firestore, (batch) => {
                        updateDoc(firestore, batch, getCollection(firestore, "lifeLogTreeNodes"), {
                          id: node$().id,
                          text: newText,
                        });

                        return Promise.resolve();
                      });
                    } finally {
                      await startTransition(() => {
                        firestore.setClock(false);
                      });
                    }
                  }

                  return (
                    <EditableValue
                      value={node$().text}
                      toText={(text) => text}
                      fromText={(text) => text}
                      onSave={async (newText) => {
                        await onSaveNode(newText);
                      }}
                      isSelected={isSelected$()}
                      isEditing={isEditing$()}
                      setIsEditing={setIsEditing}
                      selectedClassName={styles.lifeLogTree.selected}
                      editInputClassName={styles.lifeLogTree.editInput}
                    />
                  );
                }}
              />
            </div>
          </Show>
        </>
      )}
    </Show>
  );
}
