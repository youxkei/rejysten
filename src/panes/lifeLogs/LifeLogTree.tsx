import { doc, type Timestamp } from "firebase/firestore";
import { type Accessor, createEffect, createSignal, onCleanup, type Setter, Show, startTransition } from "solid-js";

import { awaitable } from "@/awaitableCallback";
import { EditableValue } from "@/components/EditableValue";
import { ChildrenNodes } from "@/components/tree";
import { LifeLogTreeNode } from "@/panes/lifeLogs/LifeLogTreeNode";
import { EditingField } from "@/panes/lifeLogs/schema";
import { useActionsService } from "@/services/actions";
import { getCollection, getDoc, useFirestoreService } from "@/services/firebase/firestore";
import { runBatch, updateDoc } from "@/services/firebase/firestore/batch";
import { createSubscribeSignal } from "@/services/firebase/firestore/subscribe";
import { getFirstChildNode } from "@/services/firebase/firestore/treeNode";
import { useStoreService } from "@/services/store";
import { addKeyDownEventListener } from "@/solid/event";
import { scrollWithOffset } from "@/solid/scroll";
import { styles } from "@/styles.css";
import { noneTimestamp, timestampToTimeText, timeTextToTimestamp } from "@/timestamp";

export function LifeLogTree(props: {
  id: string;
  prevId: string;
  nextId: string;
  firstId: string;
  lastId: string;
  isEditing: boolean;
  setIsEditing: Setter<boolean>;
  editingField: EditingField;
  setEditingField: (field: EditingField) => void;
  lifeLogCursorInfo$: Accessor<{ lifeLogId: string; cursorPosition: number } | undefined>;
  setLifeLogCursorInfo: (info: { lifeLogId: string; cursorPosition: number } | undefined) => void;
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

  // Track cursor position for Backspace/Delete merge operations
  const [mergeCursorInfo$, setMergeCursorInfo] = createSignal<{ nodeId: string; cursorPosition: number } | undefined>(
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

  const actionsService = useActionsService();
  const actions = {
    updateContext: actionsService.updateContext,
    ...actionsService.panes.lifeLogs,
  };

  let lifeLogContainerRef: HTMLDivElement | undefined;
  createEffect(() => {
    if (isLifeLogSelected$() && lifeLogContainerRef) {
      scrollWithOffset(lifeLogContainerRef);
    }
  });

  // Update actions context when this LifeLog is selected
  createEffect(() => {
    if (isSelected$()) {
      actions.updateContext((ctx) => {
        ctx.panes.lifeLogs.isEditing = props.isEditing;
        ctx.panes.lifeLogs.editingField = props.editingField;
        ctx.panes.lifeLogs.prevId = props.prevId;
        ctx.panes.lifeLogs.nextId = props.nextId;
        ctx.panes.lifeLogs.firstId = props.firstId;
        ctx.panes.lifeLogs.lastId = props.lastId;
        ctx.panes.lifeLogs.setIsEditing = props.setIsEditing;
        ctx.panes.lifeLogs.setEditingField = props.setEditingField;
      });
    }
  });

  onCleanup(() => {
    if (isSelected$()) {
      actions.updateContext((ctx) => {
        ctx.panes.lifeLogs.isEditing = false;
        ctx.panes.lifeLogs.editingField = EditingField.Text;
        ctx.panes.lifeLogs.prevId = "";
        ctx.panes.lifeLogs.nextId = "";
        ctx.panes.lifeLogs.firstId = "";
        ctx.panes.lifeLogs.lastId = "";
        ctx.panes.lifeLogs.setIsEditing = () => undefined;
        ctx.panes.lifeLogs.setEditingField = () => undefined;
      });
    }
  });

  addKeyDownEventListener(
    awaitable(async (event) => {
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
          await actions.enterTree();
          break;
        }

        case "KeyH": {
          if (shiftKey || isLifeLogSelected$()) return;
          event.stopImmediatePropagation();
          actions.exitTree();
          break;
        }

        case "KeyJ": {
          if (shiftKey || isLifeLogTreeFocused$()) return;
          event.stopImmediatePropagation();
          actions.navigateNext();
          break;
        }

        case "KeyK": {
          if (shiftKey || isLifeLogTreeFocused$()) return;
          event.stopImmediatePropagation();
          actions.navigatePrev();
          break;
        }

        case "KeyG": {
          if (isLifeLogTreeFocused$()) return; // Tree navigation handled in tree.tsx
          event.stopImmediatePropagation();
          if (shiftKey) {
            actions.goToLast();
          } else {
            actions.goToFirst();
          }
          break;
        }

        case "KeyO": {
          event.stopImmediatePropagation();
          await actions.addSiblingNode(shiftKey);
          break;
        }

        case "KeyS": {
          if (shiftKey || isLifeLogTreeFocused$()) return;
          event.stopImmediatePropagation();
          await actions.setStartAtNow();
          break;
        }

        case "KeyF": {
          if (shiftKey || isLifeLogTreeFocused$()) return;
          event.stopImmediatePropagation();
          await actions.setEndAtNow();
          break;
        }
      }
    }),
  );

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
          <div
            ref={lifeLogContainerRef}
            class={styles.lifeLogTree.container}
            classList={{ [styles.lifeLogTree.selected]: isLifeLogSelected$() }}
          >
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
                  if (event.code === "Tab" && !event.isComposing && !event.ctrlKey) {
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
                  if (event.code === "Tab" && !event.isComposing && !event.ctrlKey) {
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
              initialCursorPosition={
                props.lifeLogCursorInfo$()?.lifeLogId === props.id
                  ? props.lifeLogCursorInfo$()?.cursorPosition
                  : undefined
              }
              onKeyDown={async (event, inputRef, preventBlurSave) => {
                if (event.code === "Tab" && !event.isComposing && !event.ctrlKey) {
                  event.preventDefault();
                  preventBlurSave();
                  await saveText(inputRef.value);
                  handleTabNavigation(event.shiftKey);
                }

                // Backspace at position 0: delete empty LifeLog and move to previous
                if (event.code === "Backspace" && inputRef.selectionStart === 0) {
                  const lifeLog = lifeLog$();

                  // Check conditions for deletion
                  if (
                    lifeLog.text !== "" ||
                    !lifeLog.startAt.isEqual(noneTimestamp) ||
                    !lifeLog.endAt.isEqual(noneTimestamp)
                  ) {
                    return; // Allow normal backspace
                  }

                  // Check for child tree nodes
                  const hasChildren = await getFirstChildNode(firestore, lifeLogTreeNodesCol, lifeLog);
                  if (hasChildren) return;

                  // Check if previous LifeLog exists
                  if (props.prevId === "") return;

                  event.preventDefault();
                  preventBlurSave();

                  // Get previous LifeLog's text length for cursor position
                  const prevLifeLog = await getDoc(firestore, lifeLogsCol, props.prevId);
                  if (!prevLifeLog) return;

                  const cursorPosition = prevLifeLog.text.length;

                  // Delete current LifeLog and select previous
                  firestore.setClock(true);
                  try {
                    await runBatch(firestore, (batch) => {
                      batch.delete(doc(lifeLogsCol, props.id));
                      return Promise.resolve();
                    });

                    props.setLifeLogCursorInfo({ lifeLogId: props.prevId, cursorPosition });
                    await startTransition(() => {
                      updateState((state) => {
                        state.panesLifeLogs.selectedLifeLogId = props.prevId;
                      });
                      props.setIsEditing(true);
                      firestore.setClock(false);
                    });
                  } catch {
                    firestore.setClock(false);
                  }
                }

                // Delete at end: delete empty LifeLog and move to next
                if (event.code === "Delete" && inputRef.selectionStart === inputRef.value.length) {
                  const lifeLog = lifeLog$();

                  // Check conditions for deletion
                  if (
                    lifeLog.text !== "" ||
                    !lifeLog.startAt.isEqual(noneTimestamp) ||
                    !lifeLog.endAt.isEqual(noneTimestamp)
                  ) {
                    return; // Allow normal delete
                  }

                  // Check for child tree nodes
                  const hasChildren = await getFirstChildNode(firestore, lifeLogTreeNodesCol, lifeLog);
                  if (hasChildren) return;

                  // Check if next LifeLog exists
                  if (props.nextId === "") return;

                  event.preventDefault();
                  preventBlurSave();

                  // Delete current LifeLog and select next with cursor at start
                  firestore.setClock(true);
                  try {
                    await runBatch(firestore, (batch) => {
                      batch.delete(doc(lifeLogsCol, props.id));
                      return Promise.resolve();
                    });

                    props.setLifeLogCursorInfo({ lifeLogId: props.nextId, cursorPosition: 0 });
                    await startTransition(() => {
                      updateState((state) => {
                        state.panesLifeLogs.selectedLifeLogId = props.nextId;
                      });
                      props.setIsEditing(true);
                      firestore.setClock(false);
                    });
                  } catch {
                    firestore.setClock(false);
                  }
                }
              }}
            />
          </div>
          <Show when={isLifeLogTreeFocused$()}>
            <div class={styles.lifeLogTree.childrenNodes}>
              <ChildrenNodes
                col={getCollection(firestore, "lifeLogTreeNodes")}
                parentId={props.id}
                rootParentId={props.id}
                selectedId={selectedLifeLogNodeId$()}
                setSelectedId={setSelectedLifeLogNodeId}
                createNewNode={(newId, initialText) => ({ id: newId, text: initialText ?? "" })}
                showNode={(node$, isSelected$, handleTabIndent) => (
                  <LifeLogTreeNode
                    lifeLogId={props.id}
                    node$={node$}
                    isSelected$={isSelected$}
                    handleTabIndent={handleTabIndent}
                    isEditing={props.isEditing}
                    setIsEditing={props.setIsEditing}
                    setEditingField={props.setEditingField}
                    selectedLifeLogNodeId$={selectedLifeLogNodeId$}
                    setSelectedLifeLogNodeId={setSelectedLifeLogNodeId}
                    enterSplitNodeId$={enterSplitNodeId$}
                    setEnterSplitNodeId={setEnterSplitNodeId}
                    tabCursorInfo$={tabCursorInfo$}
                    setTabCursorInfo={setTabCursorInfo}
                    mergeCursorInfo$={mergeCursorInfo$}
                    setMergeCursorInfo={setMergeCursorInfo}
                    lifeLogText={lifeLog$().text}
                    setLifeLogCursorInfo={props.setLifeLogCursorInfo}
                  />
                )}
              />
            </div>
          </Show>
        </>
      )}
    </Show>
  );
}
