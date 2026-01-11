import { Key } from "@solid-primitives/keyed";
import equal from "fast-deep-equal";
import { doc, orderBy, query, Timestamp, where } from "firebase/firestore";
import { createMemo, createSignal, Show, startTransition } from "solid-js";
import { uuidv7 } from "uuidv7";

import { EditableValue } from "@/components/EditableValue";
import { ChildrenNodes } from "@/components/tree";
import { DateNow } from "@/date";
import { getCollection, getDoc, useFirestoreService } from "@/services/firebase/firestore";
import { runBatch, setDoc, updateDoc } from "@/services/firebase/firestore/batch";
import { collectionNgramConfig } from "@/services/firebase/firestore/ngram";
import { createSubscribeAllSignal, createSubscribeSignal } from "@/services/firebase/firestore/subscribe";
import { addNextSibling, addPrevSibling, addSingle, getFirstChildNode } from "@/services/firebase/firestore/treeNode";
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
      order: string;

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

  const [editingField$, setEditingField] = createSignal<EditingField>(EditingField.Text);
  const [isEditing$, setIsEditing] = createSignal(false);

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

  return (
    <ul class={styles.lifeLogs.list}>
      <Key each={lifeLogIdWithNeighborIds$()} by={(item) => item.id}>
        {(lifeLogWithNeighborIds) => (
          <li id={lifeLogWithNeighborIds().id} class={styles.lifeLogs.listItem}>
            <LifeLogTree
              id={lifeLogWithNeighborIds().id}
              prevId={lifeLogWithNeighborIds().prevId}
              nextId={lifeLogWithNeighborIds().nextId}
              isEditing={isEditing$()}
              setIsEditing={setIsEditing}
              editingField={editingField$()}
              setEditingField={setEditingField}
            />
          </li>
        )}
      </Key>
    </ul>
  );
}

export enum EditingField {
  StartAt = "startAt",
  EndAt = "endAt",
  Text = "text",
}

export function LifeLogTree(props: {
  id: string;
  prevId: string;
  nextId: string;
  isEditing: boolean;
  setIsEditing: (isEditing: boolean) => void;
  editingField: EditingField;
  setEditingField: (field: EditingField) => void;
}) {
  const firestore = useFirestoreService();
  const { state, updateState } = useStoreService();

  const lifeLogsCol = getCollection(firestore, "lifeLogs");
  const lifeLogTreeNodesCol = getCollection(firestore, "lifeLogTreeNodes");
  const lifeLog$ = createSubscribeSignal(
    firestore,
    () => doc(lifeLogsCol, props.id),
    () => `life log tree "${props.id}"`,
  );

  // Track node ID created from Enter key split for cursor positioning
  const [enterSplitNodeId$, setEnterSplitNodeId] = createSignal<string | undefined>(undefined);

  // Track cursor position for Tab indent/dedent operations
  const [tabCursorInfo$, setTabCursorInfo] = createSignal<{ nodeId: string; cursorPosition: number } | undefined>(
    undefined,
  );

  const selectedLifeLogNodeId$ = () => state.panesLifeLogs.selectedLifeLogNodeId;
  const setSelectedLifeLogNodeId = (selectedLifeLogNodeId: string) => {
    updateState((state) => {
      state.panesLifeLogs.selectedLifeLogNodeId = selectedLifeLogNodeId;
    });
  };

  const isSelected$ = () => state.panesLifeLogs.selectedLifeLogId === props.id;
  const isLifeLogSelected$ = () => isSelected$() && selectedLifeLogNodeId$() === "";
  const isLifeLogTreeFocused$ = () => isSelected$() && selectedLifeLogNodeId$() !== "";

  addKeyDownEventListener(async (event) => {
    if (event.isComposing || event.ctrlKey || !isSelected$()) return;

    const { shiftKey } = event;

    if (props.isEditing) {
      // Don't call preventDefault during editing to allow backspace and other input keys to work
      return;
    }

    event.preventDefault();

    switch (event.code) {
      case "KeyL": {
        if (shiftKey || isLifeLogTreeFocused$()) return;

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
            id = uuidv7();
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
        if (shiftKey || isLifeLogSelected$()) return;
        event.stopImmediatePropagation();

        setSelectedLifeLogNodeId("");

        break;
      }

      case "KeyJ": {
        if (shiftKey || isLifeLogTreeFocused$() || props.nextId === "") return;
        event.stopImmediatePropagation();

        updateState((state) => {
          state.panesLifeLogs.selectedLifeLogId = props.nextId;
        });

        break;
      }

      case "KeyK": {
        if (shiftKey || isLifeLogTreeFocused$() || props.prevId === "") return;
        event.stopImmediatePropagation();

        updateState((state) => {
          state.panesLifeLogs.selectedLifeLogId = props.prevId;
        });

        break;
      }

      case "KeyO": {
        event.stopImmediatePropagation();

        if (isLifeLogTreeFocused$()) {
          // Tree is focused: add sibling node
          const node = await getDoc(firestore, lifeLogTreeNodesCol, selectedLifeLogNodeId$());
          if (!node) return;

          const newNodeId = uuidv7();

          try {
            firestore.setClock(true);
            await runBatch(firestore, async (batch) => {
              if (shiftKey) {
                // Shift+O: add above
                await addPrevSibling(firestore, batch, lifeLogTreeNodesCol, node, { id: newNodeId, text: "" });
              } else {
                // o: add below
                await addNextSibling(firestore, batch, lifeLogTreeNodesCol, node, { id: newNodeId, text: "" });
              }
            });

            await startTransition(() => {
              setSelectedLifeLogNodeId(newNodeId);
              props.setIsEditing(true);
              firestore.setClock(false);
            });
          } finally {
            firestore.setClock(false);
          }
        } else {
          // LifeLog is focused: add new LifeLog
          if (shiftKey) return;

          const lifeLog = await getDoc(firestore, lifeLogsCol, props.id);
          if (!lifeLog) return;

          const newLifeLogId = uuidv7();

          firestore.setClock(true);
          try {
            await runBatch(firestore, (batch) => {
              setDoc(firestore, batch, lifeLogsCol, {
                id: newLifeLogId,
                text: "",
                startAt: lifeLog.endAt,
                endAt: noneTimestamp,
              });

              return Promise.resolve();
            });

            await startTransition(() => {
              updateState((state) => {
                state.panesLifeLogs.selectedLifeLogId = newLifeLogId;
                state.panesLifeLogs.selectedLifeLogNodeId = "";
              });

              props.setIsEditing(true);
              props.setEditingField(EditingField.Text);

              firestore.setClock(false);
            });
          } finally {
            firestore.setClock(false);
          }
        }

        break;
      }

      case "KeyS": {
        if (shiftKey || isLifeLogTreeFocused$()) return;
        event.stopImmediatePropagation();

        const lifeLog = await getDoc(firestore, lifeLogsCol, props.id);
        if (!lifeLog || !lifeLog.startAt.isEqual(noneTimestamp)) return;

        await saveStartAt(Timestamp.fromMillis(Math.floor(DateNow() / 1000) * 1000));

        break;
      }

      case "KeyF": {
        if (shiftKey || isLifeLogTreeFocused$()) return;
        event.stopImmediatePropagation();

        const lifeLog = await getDoc(firestore, lifeLogsCol, props.id);
        if (!lifeLog || !lifeLog.endAt.isEqual(noneTimestamp)) return;

        await saveEndAt(Timestamp.fromMillis(Math.floor(DateNow() / 1000) * 1000));

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
    const currentIndex = fields.indexOf(props.editingField);

    if (shiftKey) {
      // Shift+Tab: go to previous field
      const nextIndex = currentIndex > 0 ? currentIndex - 1 : fields.length - 1;
      props.setEditingField(fields[nextIndex]);
    } else {
      // Tab: go to next field
      const nextIndex = currentIndex < fields.length - 1 ? currentIndex + 1 : 0;
      props.setEditingField(fields[nextIndex]);
    }
  }

  return (
    <Show when={lifeLog$()}>
      {(lifeLog$) => (
        <>
          <div class={styles.lifeLogTree.container} classList={{ [styles.lifeLogTree.selected]: isLifeLogSelected$() }}>
            <div class={styles.lifeLogTree.timeRange}>
              <EditableValue
                debugId="startAt"
                value={lifeLog$().startAt}
                onSave={saveStartAt}
                isSelected={isLifeLogSelected$() && props.editingField == EditingField.StartAt}
                isEditing={props.isEditing && props.editingField === EditingField.StartAt}
                setIsEditing={(editing) => {
                  props.setIsEditing(editing);
                  props.setEditingField(editing ? EditingField.StartAt : EditingField.Text);
                }}
                toText={(ts) => timestampToTimeText(ts) ?? "N/A"}
                toEditText={(ts) => timestampToTimeText(ts, false) ?? ""}
                fromText={timeTextToTimestamp}
                editInputClassName={styles.lifeLogTree.editInput}
                onKeyDown={async (event, inputRef, preventBlurSave) => {
                  if (event.code === "Tab") {
                    event.preventDefault();
                    preventBlurSave();
                    const newValue = timeTextToTimestamp(inputRef.value);
                    if (newValue !== undefined) {
                      await saveStartAt(newValue);
                    }
                    handleTabNavigation(event.shiftKey);
                  }
                }}
              />
              <span>-</span>
              <EditableValue
                debugId="endAt"
                value={lifeLog$().endAt}
                onSave={saveEndAt}
                isSelected={isLifeLogSelected$() && props.editingField == EditingField.EndAt}
                isEditing={props.isEditing && props.editingField === EditingField.EndAt}
                setIsEditing={(editing) => {
                  props.setIsEditing(editing);
                  props.setEditingField(editing ? EditingField.EndAt : EditingField.Text);
                }}
                toText={(ts) => timestampToTimeText(ts) ?? "N/A"}
                toEditText={(ts) => timestampToTimeText(ts, false) ?? ""}
                fromText={timeTextToTimestamp}
                editInputClassName={styles.lifeLogTree.editInput}
                onKeyDown={async (event, inputRef, preventBlurSave) => {
                  if (event.code === "Tab") {
                    event.preventDefault();
                    preventBlurSave();
                    const newValue = timeTextToTimestamp(inputRef.value);
                    if (newValue !== undefined) {
                      await saveEndAt(newValue);
                    }
                    handleTabNavigation(event.shiftKey);
                  }
                }}
              />
            </div>
            <EditableValue
              debugId="text"
              value={lifeLog$().text}
              onSave={saveText}
              isSelected={isLifeLogSelected$() && props.editingField === EditingField.Text}
              isEditing={props.isEditing && props.editingField === EditingField.Text}
              setIsEditing={(editing) => {
                props.setEditingField(EditingField.Text);
                props.setIsEditing(editing);
              }}
              toText={(text) => text}
              fromText={(text) => text}
              className={styles.lifeLogTree.text}
              editInputClassName={styles.lifeLogTree.editInput}
              onKeyDown={async (event, inputRef, preventBlurSave) => {
                if (event.code === "Tab") {
                  event.preventDefault();
                  preventBlurSave();
                  await saveText(inputRef.value);
                  handleTabNavigation(event.shiftKey);
                }
              }}
            />
          </div>
          <Show when={isLifeLogTreeFocused$()}>
            <div class={styles.lifeLogTree.childrenNodes}>
              <ChildrenNodes
                col={getCollection(firestore, "lifeLogTreeNodes")}
                parentId={props.id}
                selectedId={selectedLifeLogNodeId$()}
                setSelectedId={setSelectedLifeLogNodeId}
                createNewNode={(newId, initialText) => ({ id: newId, text: initialText ?? "" })}
                showNode={(node$, isSelected$, handleTabIndent) => {
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

                  async function handleKeyDown(
                    event: KeyboardEvent,
                    inputRef: HTMLInputElement,
                    preventBlurSave: () => void,
                  ) {
                    // Handle Tab (save + indent/dedent via tree.tsx)
                    if (event.code === "Tab") {
                      event.preventDefault();
                      preventBlurSave();

                      const cursorPosition = inputRef.selectionStart ?? 0;
                      await onSaveNode(inputRef.value);
                      await handleTabIndent(event.shiftKey);
                      setTabCursorInfo({ nodeId: node$().id, cursorPosition });
                      return;
                    }

                    // Handle Enter (LifeLogTree-specific: split node)
                    if (event.code === "Enter" && !event.isComposing) {
                      event.preventDefault();
                      preventBlurSave();

                      const text = inputRef.value;
                      const cursorPos = inputRef.selectionStart ?? text.length;
                      const beforeCursor = text.slice(0, cursorPos);
                      const afterCursor = text.slice(cursorPos);

                      await onSaveNode(beforeCursor);

                      // Create new sibling node with afterCursor
                      const node = await getDoc(firestore, lifeLogTreeNodesCol, node$().id);
                      if (!node) return;

                      const newNodeId = uuidv7();
                      setEnterSplitNodeId(newNodeId);

                      try {
                        firestore.setClock(true);
                        await runBatch(firestore, async (batch) => {
                          await addNextSibling(firestore, batch, lifeLogTreeNodesCol, node, {
                            id: newNodeId,
                            text: afterCursor,
                          });
                        });

                        await startTransition(() => {
                          setSelectedLifeLogNodeId(newNodeId);
                          props.setIsEditing(true);
                          firestore.setClock(false);
                        });
                      } finally {
                        firestore.setClock(false);
                      }
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
                      isEditing={props.isEditing}
                      setIsEditing={(editing) => {
                        props.setIsEditing(editing);
                        if (!editing) {
                          setEnterSplitNodeId(undefined);
                          setTabCursorInfo(undefined);
                        }
                      }}
                      selectedClassName={styles.lifeLogTree.selected}
                      editInputClassName={styles.lifeLogTree.editInput}
                      onKeyDown={handleKeyDown}
                      initialCursorPosition={
                        enterSplitNodeId$() === node$().id
                          ? 0
                          : tabCursorInfo$()?.nodeId === node$().id
                            ? tabCursorInfo$()?.cursorPosition
                            : undefined
                      }
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
