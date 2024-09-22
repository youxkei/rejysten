import equals from "fast-deep-equal";
import { doc, query, where } from "firebase/firestore";
import { createMemo, For, Show } from "solid-js";

import { useFirebaseService } from "@/services/firebase";
import { getCollection, runKeyDownTransaction, txMustUpdated } from "@/services/firebase/firestore";
import { createSubscribeAllSignal, createSubscribeSignal } from "@/services/firebase/firestore/subscribe";
import { dedent, getFirstChildNode, indent } from "@/services/firebase/firestore/treeNode";
import { addKeyDownEventListenerWithLock, useStoreService } from "@/services/store";
import { styles } from "@/styles.css";

export function LifeLogTree(props: { id: string; prevId: string; nextId: string }) {
  const firebase = useFirebaseService();
  const { state, updateState } = useStoreService();

  const lifeLogsCol = getCollection(firebase, "lifeLogs");
  const lifeLogTreeNodesCol = getCollection(firebase, "lifeLogTreeNodes");
  const lifeLog$ = createSubscribeSignal(() => doc(lifeLogsCol, props.id));
  const isSelected$ = () => props.id === state.lifeLogs.selectedId;

  addKeyDownEventListenerWithLock((event) => {
    if (!isSelected$()) return;

    const lifeLog = lifeLog$();
    if (!lifeLog) return;

    const { shiftKey, ctrlKey } = event;

    switch (event.code) {
      case "KeyL": {
        if (ctrlKey || shiftKey) return;

        event.stopImmediatePropagation();

        void runKeyDownTransaction(async (tx) => {
          const firstChildNode = await getFirstChildNode(tx, lifeLogTreeNodesCol, lifeLog);
          if (!firstChildNode) return;

          updateState((state) => {
            state.lifeLogs.selectedId = firstChildNode.id;
          });
        });

        break;
      }
    }
  });

  return (
    <Show when={lifeLog$()}>
      {(lifeLog$) => {
        return (
          <>
            <div classList={{ [styles.lifeLogTree.selected]: isSelected$() }}>
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
  const isSelected$ = () => props.id === state.lifeLogs.selectedId;

  addKeyDownEventListenerWithLock((event) => {
    if (!isSelected$()) return;

    const node = node$();
    if (!node) return;

    const { shiftKey, ctrlKey } = event;

    switch (event.code) {
      case "KeyJ": {
        if (ctrlKey || shiftKey) return;

        if (node.belowId === "") return;

        event.stopImmediatePropagation();

        updateState((state) => {
          state.lifeLogs.selectedId = node.belowId;
        });

        break;
      }

      case "KeyK": {
        if (ctrlKey || shiftKey) return;

        if (node.aboveId === "") return;

        updateState((state) => {
          state.lifeLogs.selectedId = node.aboveId;
        });

        event.stopImmediatePropagation();

        break;
      }

      case "KeyH": {
        if (ctrlKey || shiftKey) return;

        event.stopImmediatePropagation();

        updateState((state) => {
          state.lifeLogs.selectedId = props.logId;
        });

        break;
      }

      case "Tab": {
        if (ctrlKey) return;

        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();

        void runKeyDownTransaction(async (tx) => {
          console.timeStamp("Tab start");
          await txMustUpdated(tx, lifeLogTreeNodesCol, node);
          console.timeStamp("txMustUpdated OK");

          if (shiftKey) {
            console.log("dedent");
            (await dedent(tx, lifeLogTreeNodesCol, node))();
          } else {
            console.log("indent");

            const indentWrite = await indent(tx, lifeLogTreeNodesCol, node);
            console.timeStamp("indent read OK");
            indentWrite();
            console.timeStamp("indent write OK");
          }
          console.timeStamp("Tab end");
        });
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
