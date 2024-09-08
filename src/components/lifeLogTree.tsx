import equals from "fast-deep-equal";
import { doc, query, where } from "firebase/firestore";
import { createMemo, createResource, For, Show } from "solid-js";

import { useFirebaseService } from "@/services/firebase";
import { getCollection, runTransaction } from "@/services/firebase/firestore";
import { createSubscribeAllSignal, createSubscribeSignal } from "@/services/firebase/firestore/subscribe";
import { getAboveNode, getBelowNode, getFirstChildNode } from "@/services/firebase/firestore/treeNode";
import { useStoreService } from "@/services/store";
import { styles } from "@/styles.css";

export function LifeLogTree(props: { id: string; prevId: string; nextId: string }) {
  const firebase = useFirebaseService();
  const { state, updateState } = useStoreService();

  const lifeLogsCol = getCollection(firebase, "lifeLogs");
  const lifeLogTreeNodesCol = getCollection(firebase, "lifeLogTreeNodes");
  const lifeLog$ = createSubscribeSignal(() => doc(lifeLogsCol, props.id));
  const isSelected$ = () => props.id === state.lifeLogs.selectedId;
  const [firstChildNode$] = createResource(lifeLog$, (lifeLog) =>
    runTransaction(firebase, (tx) => getFirstChildNode(tx, lifeLogTreeNodesCol, lifeLog)),
  );

  window.addEventListener("keydown", (event) => {
    if (!isSelected$()) return;

    const lifeLog = lifeLog$();
    if (!lifeLog) return;

    const { shiftKey, ctrlKey } = event;

    switch (event.code) {
      case "KeyL": {
        if (ctrlKey || shiftKey) return;

        const firstChildNode = firstChildNode$();
        if (!firstChildNode) return;

        updateState((state) => {
          state.lifeLogs.selectedId = firstChildNode.id;
        });

        event.stopImmediatePropagation();

        break;
      }
    }
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

  const lifeLogTreeNodesCol = getCollection(firebase, "lifeLogTreeNodes");
  const node$ = createSubscribeSignal(() => doc(lifeLogTreeNodesCol, props.id));
  const [aboveNode$] = createResource(node$, (node) =>
    runTransaction(firebase, (tx) => getAboveNode(tx, lifeLogTreeNodesCol, node)),
  );
  const [belowNode$] = createResource(node$, (node) =>
    runTransaction(firebase, (tx) => getBelowNode(tx, lifeLogTreeNodesCol, node)),
  );
  const isSelected$ = () => props.id === state.lifeLogs.selectedId;

  window.addEventListener("keydown", (event) => {
    if (!isSelected$()) return;

    const node = node$();
    if (!node) return;

    const { shiftKey, ctrlKey } = event;

    switch (event.code) {
      case "KeyJ": {
        if (ctrlKey || shiftKey) return;

        const belowNode = belowNode$();
        if (!belowNode) return;

        updateState((state) => {
          state.lifeLogs.selectedId = belowNode.id;
        });

        event.stopImmediatePropagation();

        break;
      }

      case "KeyK": {
        if (ctrlKey || shiftKey) return;

        const aboveNode = aboveNode$();
        if (!aboveNode) return;

        updateState((state) => {
          state.lifeLogs.selectedId = aboveNode.id;
        });

        event.stopImmediatePropagation();

        break;
      }

      case "KeyH": {
        if (ctrlKey || shiftKey) return;

        updateState((state) => {
          state.lifeLogs.selectedId = props.logId;
        });

        event.stopImmediatePropagation();

        break;
      }
    }
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
