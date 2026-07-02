import { debounce } from "@solid-primitives/scheduled";
import { doc } from "firebase/firestore";
import { type Accessor, createEffect, createMemo, createSignal, onCleanup, type Setter, Show } from "solid-js";

import { EditableValue } from "@/components/editableValue";
import { ChildrenNodes } from "@/components/tree";
import { DateNow } from "@/date";
import { onQuerySnapshot } from "@/firestore/onSnapshot";
import { analyzeTextForNgrams } from "@/ngram";
import { LifeLogTreeNode } from "@/panes/lifeLogs/lifeLogTreeNode";
import { EditingField } from "@/panes/lifeLogs/schema";
import { useActionsService } from "@/services/actions";
import { type DocumentData, getCollection, useFirestoreService } from "@/services/firebase/firestore";
import { encodeNgramKeyForFirestore } from "@/services/firebase/firestore/ngram";
import { limit, orderByDocumentId, query, where } from "@/services/firebase/firestore/query";
import { type Schema } from "@/services/firebase/firestore/schema";
import { createSubscribeSignal } from "@/services/firebase/firestore/subscribe";
import { useStoreService } from "@/services/store";
import { addKeyDownEventListener } from "@/solid/event";
import { scrollWithOffset } from "@/solid/scroll";
import { createSubscribeWithSignal } from "@/solid/subscribe";
import { styles } from "@/styles.css";
import { formatDuration, timestampToTimeText, timeTextToTimestamp } from "@/timestamp";
import { uuidV7ToMs } from "@/uuid";

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
  fallbackLifeLog?: DocumentData<Schema["lifeLogs"]>;
}) {
  const firestore = useFirestoreService();
  const { state, updateState } = useStoreService();

  const lifeLogsCol = getCollection(firestore, "lifeLogs");
  const ngramsCol = getCollection(firestore, "ngrams");
  const subscribedLifeLog$ = createSubscribeSignal(
    firestore,
    () => (props.id === "" ? undefined : doc(lifeLogsCol, props.id)),
    () => `life log tree "${props.id}"`,
  );
  const lifeLog$ = () => subscribedLifeLog$() ?? props.fallbackLifeLog;

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

  // Live text of the text field while editing (fed by EditableValue's onTextChange),
  // used to compute completion candidates.
  const [editingText$, setEditingText] = createSignal("");
  // Debounce so we don't re-subscribe on every keystroke.
  const [debouncedEditingText$, setDebouncedEditingText] = createSignal("");
  const updateDebouncedEditingText = debounce(setDebouncedEditingText, 200);
  createEffect(() => {
    updateDebouncedEditingText(editingText$());
  });

  // Completion candidates for the text field, drawn from past lifeLog texts via the
  // ngram corpus. The query is constrained to collection == "lifeLogs" and bounded by a
  // limit so the result set stays small: a short fragment (e.g. a single bigram) otherwise
  // matches a large share of the whole corpus across every collection, forcing the
  // subscription to transfer and re-merge thousands of docs on every edit just to surface
  // at most a handful of suggestions. Ordering by document id descending returns the newest
  // matches first (uuidv7 ids sort by creation time), so the limited window holds recent
  // lifeLogs; the age cutoff below then keeps only the last COMPLETION_WINDOW_MONTHS months.
  // Uses a plain onSnapshot subscription (not the resource-backed createSubscribeAllSignal)
  // so a query change mid-edit can't trip the page Suspense boundary and unmount the edit input.
  const MAX_COMPLETION_CANDIDATES = 8;
  // Fetch more rows than we display so dedupe and dropping the text being edited still
  // leave a full set of suggestions, while keeping the query bounded.
  const COMPLETION_CANDIDATE_FETCH_LIMIT = 50;
  // Only suggest from lifeLogs created within this many months.
  const COMPLETION_WINDOW_MONTHS = 2;
  const isEditingText$ = () => props.isEditing && props.editingField === EditingField.Text && isLifeLogSelected$();
  const completionResults$ = createSubscribeWithSignal<
    DocumentData<Schema["ngrams"]>[],
    DocumentData<Schema["ngrams"]>[]
  >((setValue) => {
    if (!isEditingText$()) {
      setValue([]);
      return;
    }
    const text = debouncedEditingText$();
    if (text.trim().length < 2) {
      setValue([]);
      return;
    }
    const ngrams = Object.keys(analyzeTextForNgrams(text).ngramMap);
    if (ngrams.length === 0) {
      setValue([]);
      return;
    }
    const client = firestore.firestoreClient;
    if (!client) {
      setValue([]);
      return;
    }
    const q = query(
      ngramsCol,
      where("collection", "==", "lifeLogs"), // suggest only from lifeLog texts
      ...ngrams.map((ngram) => where(`ngramMap.${encodeNgramKeyForFirestore(ngram)}`, "==", true)),
      orderByDocumentId("desc"), // newest lifeLogs first (uuidv7 ids sort by creation time)
      limit(COMPLETION_CANDIDATE_FETCH_LIMIT),
    );
    const unsubscribe = onQuerySnapshot({ client, query: q, setValue });
    onCleanup(unsubscribe);
  }, []);
  const completionItems$ = createMemo(() => {
    if (!isEditingText$()) return [];
    const current = editingText$();
    const cutoff = new Date(DateNow());
    cutoff.setMonth(cutoff.getMonth() - COMPLETION_WINDOW_MONTHS);
    const cutoffMs = cutoff.getTime();
    // The edited lifeLog's own ngram doc matches the query too (the debounced save keeps
    // writing the in-progress text), so exclude it by id — its saved text lags the input,
    // and a text comparison only catches the moment they happen to be equal.
    const selfNgramId = `${props.id}lifeLogs`;
    const seen = new Set<string>();
    const items: string[] = [];
    for (const result of completionResults$()) {
      // Keep only lifeLogs created within the window; a non-uuidv7 id (NaN) is dropped too.
      if (!(uuidV7ToMs(result.id) >= cutoffMs)) continue;
      if (result.id === selfNgramId) continue; // never suggest the lifeLog being edited
      if (result.text === current) continue; // exclude candidates identical to the current input
      if (seen.has(result.text)) continue; // dedupe
      seen.add(result.text);
      items.push(result.text);
      if (items.length >= MAX_COMPLETION_CANDIDATES) break;
    }
    return items;
  });

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

  addKeyDownEventListener((event) => {
    if (event.isComposing || event.ctrlKey || !isSelected$()) return;
    if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return;

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
        actions.enterTree();
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
          actions.goToLatest();
        } else {
          actions.goToFirst();
        }
        if (isLifeLogSelected$() && lifeLogContainerRef) {
          scrollWithOffset(lifeLogContainerRef);
        }
        break;
      }

      case "KeyO": {
        event.stopImmediatePropagation();
        actions.addSiblingNode(shiftKey);
        break;
      }

      case "KeyS": {
        if (shiftKey || isLifeLogTreeFocused$()) return;
        event.stopImmediatePropagation();
        actions.setStartAtNow();
        break;
      }

      case "KeyF": {
        if (shiftKey || isLifeLogTreeFocused$()) return;
        event.stopImmediatePropagation();
        actions.setEndAtNow();
        break;
      }
    }
  });

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
                onSave={(_, stopEditing) => {
                  actions.saveStartAt(stopEditing);
                }}
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
                onKeyDown={(event, _inputRef, preventBlurSave) => {
                  if (event.code === "Tab" && !event.isComposing && !event.ctrlKey) {
                    event.preventDefault();
                    preventBlurSave();
                    actions.saveStartAt(false);
                    if (event.shiftKey) {
                      actions.cycleFieldPrev();
                    } else {
                      actions.cycleFieldNext();
                    }
                  }
                }}
                onPreventBlurSave={(fn) => {
                  actions.updateContext((ctx) => {
                    ctx.panes.lifeLogs.preventBlurSave = fn;
                  });
                }}
              />
              <span>-</span>
              <EditableValue
                debugId="endAt"
                value={lifeLog$().endAt}
                onSave={(_, stopEditing) => {
                  actions.saveEndAt(stopEditing);
                }}
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
                onKeyDown={(event, _inputRef, preventBlurSave) => {
                  if (event.code === "Tab" && !event.isComposing && !event.ctrlKey) {
                    event.preventDefault();
                    preventBlurSave();
                    actions.saveEndAt(false);
                    if (event.shiftKey) {
                      actions.cycleFieldPrev();
                    } else {
                      actions.cycleFieldNext();
                    }
                  }
                }}
                onPreventBlurSave={(fn) => {
                  actions.updateContext((ctx) => {
                    ctx.panes.lifeLogs.preventBlurSave = fn;
                  });
                }}
              />
              <Show when={formatDuration(lifeLog$().startAt, lifeLog$().endAt)}>
                {(duration) => <span>({duration()})</span>}
              </Show>
            </div>
            <EditableValue
              debugId="text"
              value={lifeLog$().text}
              onSave={(_, stopEditing) => {
                actions.saveText(stopEditing);
              }}
              isSelected={isLifeLogSelected$() && props.editingField === EditingField.Text}
              isEditing={props.isEditing && props.editingField === EditingField.Text}
              setIsEditing={(editing) => {
                props.setEditingField(EditingField.Text);
                props.setIsEditing(editing);
              }}
              toText={(text) => text}
              fromText={(text) => text}
              completion={{ items$: completionItems$ }}
              className={styles.lifeLogTree.text}
              editInputClassName={styles.lifeLogTree.editInput}
              initialCursorPosition={
                props.lifeLogCursorInfo$()?.lifeLogId === props.id
                  ? props.lifeLogCursorInfo$()?.cursorPosition
                  : undefined
              }
              onTextChange={(text) => {
                setEditingText(text);
                actions.updateContext((ctx) => {
                  ctx.panes.lifeLogs.pendingText = text;
                });
              }}
              onKeyDown={(event, inputRef, preventBlurSave) => {
                if (event.code === "Tab" && !event.isComposing && !event.ctrlKey) {
                  event.preventDefault();
                  preventBlurSave();
                  actions.saveText(false);
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
                  actions.deleteEmptyLifeLogToPrev();
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
                  actions.deleteEmptyLifeLogToNext();
                }
              }}
              onPreventBlurSave={(fn) => {
                actions.updateContext((ctx) => {
                  ctx.panes.lifeLogs.preventBlurSave = fn;
                });
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
                createNewNode={(newId, initialText) => ({ id: newId, text: initialText ?? "", lifeLogId: props.id })}
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
