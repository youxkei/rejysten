import { useKeyDownEvent } from "@solid-primitives/keyboard";
import equals from "fast-deep-equal";
import { doc, query, where } from "firebase/firestore";
import { createEffect, createMemo, For, Show, untrack } from "solid-js";

import { useFirebaseService } from "@/services/firebase";
import { getCollection, runTransaction, txGet, txMustUpdated } from "@/services/firebase/firestore";
import { createSubscribeAllSignal, createSubscribeSignal } from "@/services/firebase/firestore/subscribe";
import { getAboveNode, getBelowNode, getFirstChildNode } from "@/services/firebase/firestore/treeNode";
import { useStoreService } from "@/services/store";
import { styles } from "@/styles.css";

export function LifeLogTree(props: { id: string; prevId: string; nextId: string }) {
  const firebase = useFirebaseService();
  const { state, updateState } = useStoreService();
  const keyDownEvent$ = useKeyDownEvent();

  const lifeLogsCol = getCollection(firebase, "lifeLogs");
  const lifeLogTreeNodesCol = getCollection(firebase, "lifeLogTreeNodes");
  const lifeLog$ = createSubscribeSignal(() => doc(lifeLogsCol, props.id));
  const isSelected$ = () => props.id === state.lifeLogs.selectedId;

  createEffect(() => {
    const event = keyDownEvent$();
    if (!event) return;

    untrack(() => {
      if (!isSelected$()) return;

      const lifeLog = lifeLog$();
      if (!lifeLog) return;

      const { shiftKey, ctrlKey } = event;

      void runTransaction(firebase, async (tx) => {
        await txMustUpdated(tx, lifeLogsCol, lifeLog);

        switch (event.code) {
          case "KeyL": {
            if (ctrlKey || shiftKey) return;

            const firstChild = await getFirstChildNode(tx, lifeLogTreeNodesCol, lifeLog);
            if (!firstChild) return;

            updateState((state) => {
              state.lifeLogs.selectedId = firstChild.id;
            });

            break;
          }
        }
      });
    });
  });

  return (
    <Show when={lifeLog$()}>
      {(lifeLog$) => {
        return (
          <>
            <div classList={{ [styles.lifeLogTree.selected]: props.id === state.lifeLogs.selectedId }}>
              <span>{lifeLog$().text}</span>
            </div>
            <ChildrenNodes parentId={props.id} logId={props.id} />
          </>
        );
      }}
    </Show>
  );
}

export function ChildrenNodes(props: { parentId: string; logId: string }) {
  const firebase = useFirebaseService();

  const lifeLogTreeNodesCol = getCollection(firebase, "lifeLogTreeNodes");
  const childrenNodes$ = createSubscribeAllSignal(() =>
    query(lifeLogTreeNodesCol, where("parentId", "==", props.parentId)),
  );
  const childrenIds$ = createMemo(() => childrenNodes$().map((childNode) => childNode.id), [], { equals });

  return (
    <ul>
      <For each={childrenIds$()}>
        {(childId) => (
          <li>
            <Node id={childId} logId={props.logId} />
          </li>
        )}
      </For>
    </ul>
  );
}

export function Node(props: { id: string; logId: string }) {
  const firebase = useFirebaseService();
  const { state, updateState } = useStoreService();
  const keyDownEvent$ = useKeyDownEvent();

  const lifeLogsCol = getCollection(firebase, "lifeLogs");
  const lifeLogTreeNodesCol = getCollection(firebase, "lifeLogTreeNodes");
  const node$ = createSubscribeSignal(() => doc(lifeLogTreeNodesCol, props.id));
  const isSelected$ = () => props.id === state.lifeLogs.selectedId;

  createEffect(() => {
    const event = keyDownEvent$();
    if (!event) return;

    untrack(() => {
      if (!isSelected$()) return;

      const node = node$();
      if (!node) return;

      const { shiftKey, ctrlKey } = event;

      void runTransaction(firebase, async (tx) => {
        await txMustUpdated(tx, lifeLogTreeNodesCol, node);

        switch (event.code) {
          case "KeyJ": {
            if (ctrlKey || shiftKey) return;

            const belowNode = await getBelowNode(tx, lifeLogTreeNodesCol, node);
            if (!belowNode) return;

            updateState((state) => {
              state.lifeLogs.selectedId = belowNode.id;
            });

            break;
          }

          case "KeyK": {
            if (ctrlKey || shiftKey) return;

            const aboveNode = await getAboveNode(tx, lifeLogTreeNodesCol, node);
            if (!aboveNode) return;

            updateState((state) => {
              state.lifeLogs.selectedId = aboveNode.id;
            });

            break;
          }

          case "KeyH": {
            if (ctrlKey || shiftKey) return;

            const log = await txGet(tx, lifeLogsCol, props.logId);
            if (!log) return;

            updateState((state) => {
              state.lifeLogs.selectedId = log.id;
            });

            break;
          }
        }
      });
    });
  });

  return (
    <Show when={node$()}>
      {(node) => {
        return (
          <>
            <div classList={{ [styles.lifeLogTree.selected]: isSelected$() }}>
              <span>{node().text}</span>
            </div>
            <ChildrenNodes parentId={props.id} logId={props.logId} />
          </>
        );
      }}
    </Show>
  );
}
