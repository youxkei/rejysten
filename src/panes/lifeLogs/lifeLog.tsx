import { doc } from "firebase/firestore";
import { type Accessor, createEffect, createSignal, onCleanup, type Setter, Show } from "solid-js";

import { awaitable } from "@/awaitableCallback";
import { EditableValue } from "@/components/EditableValue";
import { ChildrenNodes } from "@/components/tree";
import { LifeLogTreeNode } from "@/panes/lifeLogs/lifeLogTreeNode";
import { EditingField } from "@/panes/lifeLogs/schema";
import { useActionsService } from "@/services/actions";
import { getCollection, useFirestoreService } from "@/services/firebase/firestore";
import { createSubscribeSignal } from "@/services/firebase/firestore/subscribe";
import { useStoreService } from "@/services/store";
import { addKeyDownEventListener } from "@/solid/event";
import { scrollWithOffset } from "@/solid/scroll";
import { styles } from "@/styles.css";
import { timestampToTimeText, timeTextToTimestamp } from "@/timestamp";

export function LifeLog(props: {
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
        ctx.panes.lifeLogs.setLifeLogCursorInfo = props.setLifeLogCursorInfo;
        // Tree node setters
        ctx.panes.lifeLogs.setEnterSplitNodeId = setEnterSplitNodeId;
        ctx.panes.lifeLogs.setTabCursorInfo = setTabCursorInfo;
        ctx.panes.lifeLogs.setMergeCursorInfo = setMergeCursorInfo;
        // LifeLog text length for cursor positioning when exiting tree
        ctx.panes.lifeLogs.lifeLogTextLength = lifeLog$()?.text.length ?? 0;
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
        ctx.panes.lifeLogs.setLifeLogCursorInfo = () => undefined;
        // Tree node setters
        ctx.panes.lifeLogs.setEnterSplitNodeId = () => undefined;
        ctx.panes.lifeLogs.setTabCursorInfo = () => undefined;
        ctx.panes.lifeLogs.setMergeCursorInfo = () => undefined;
        ctx.panes.lifeLogs.lifeLogTextLength = 0;
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

  return (
    <Show when={lifeLog$()}>
      {(lifeLog$) => (
        <>
          <div
            ref={lifeLogContainerRef}
            class={styles.lifeLogTree.container}
            classList={{ [styles.lifeLogTree.selected]: isLifeLogSelected$() }}
            onClick={(e) => {
              // 編集中のinputをクリックした場合はフォーカス変更しない
              if (e.target instanceof HTMLInputElement) return;

              updateState((s) => {
                s.panesLifeLogs.selectedLifeLogId = props.id;
                s.panesLifeLogs.selectedLifeLogNodeId = "";
              });
            }}
          >
            <div class={styles.lifeLogTree.timeRange}>
              <EditableValue
                debugId="startAt"
                value={lifeLog$().startAt}
                onSave={actions.saveStartAt}
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
                onTextChange={(text) => {
                  actions.updateContext((ctx) => {
                    ctx.panes.lifeLogs.pendingStartAt = timeTextToTimestamp(text);
                  });
                }}
                onKeyDown={awaitable(async (event, _inputRef, preventBlurSave) => {
                  if (event.code === "Tab" && !event.isComposing && !event.ctrlKey) {
                    event.preventDefault();
                    preventBlurSave();
                    await actions.saveStartAt();
                    if (event.shiftKey) {
                      actions.cycleFieldPrev();
                    } else {
                      actions.cycleFieldNext();
                    }
                  }
                })}
              />
              <span>-</span>
              <EditableValue
                debugId="endAt"
                value={lifeLog$().endAt}
                onSave={actions.saveEndAt}
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
                onTextChange={(text) => {
                  actions.updateContext((ctx) => {
                    ctx.panes.lifeLogs.pendingEndAt = timeTextToTimestamp(text);
                  });
                }}
                onKeyDown={awaitable(async (event, _inputRef, preventBlurSave) => {
                  if (event.code === "Tab" && !event.isComposing && !event.ctrlKey) {
                    event.preventDefault();
                    preventBlurSave();
                    await actions.saveEndAt();
                    if (event.shiftKey) {
                      actions.cycleFieldPrev();
                    } else {
                      actions.cycleFieldNext();
                    }
                  }
                })}
              />
            </div>
            <EditableValue
              debugId="text"
              value={lifeLog$().text}
              onSave={actions.saveText}
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
              onTextChange={(text) => {
                actions.updateContext((ctx) => {
                  ctx.panes.lifeLogs.pendingText = text;
                });
              }}
              onKeyDown={awaitable(async (event, inputRef, preventBlurSave) => {
                if (event.code === "Tab" && !event.isComposing && !event.ctrlKey) {
                  event.preventDefault();
                  preventBlurSave();
                  await actions.saveText();
                  if (event.shiftKey) {
                    actions.cycleFieldPrev();
                  } else {
                    actions.cycleFieldNext();
                  }
                  return;
                }

                // Only intercept Backspace at position 0 when no text is selected
                if (
                  event.code === "Backspace" &&
                  inputRef.selectionStart === 0 &&
                  inputRef.selectionStart === inputRef.selectionEnd
                ) {
                  event.preventDefault();
                  preventBlurSave();
                  await actions.deleteEmptyLifeLogToPrev();
                  return;
                }

                // Only intercept Delete at end when no text is selected
                if (
                  event.code === "Delete" &&
                  inputRef.selectionStart === inputRef.value.length &&
                  inputRef.selectionStart === inputRef.selectionEnd
                ) {
                  event.preventDefault();
                  preventBlurSave();
                  await actions.deleteEmptyLifeLogToNext();
                }
              })}
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
                showNode={(node$, isSelected$) => (
                  <LifeLogTreeNode
                    node$={node$}
                    isSelected$={isSelected$}
                    isEditing={props.isEditing}
                    setIsEditing={props.setIsEditing}
                    enterSplitNodeId$={enterSplitNodeId$}
                    setEnterSplitNodeId={setEnterSplitNodeId}
                    tabCursorInfo$={tabCursorInfo$}
                    setTabCursorInfo={setTabCursorInfo}
                    mergeCursorInfo$={mergeCursorInfo$}
                    setMergeCursorInfo={setMergeCursorInfo}
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
