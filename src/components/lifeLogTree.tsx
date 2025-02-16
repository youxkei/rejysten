import equals from "fast-deep-equal";
import { doc, query, where } from "firebase/firestore";
import { createComputed, createMemo, For, Show, startTransition } from "solid-js";

import { useFirebaseService } from "@/services/firebase";
import { getCollection, runBatchWithLock } from "@/services/firebase/firestore";
import { createSubscribeAllSignal, createSubscribeSignal } from "@/services/firebase/firestore/subscribe";
import { dedent, getFirstChildNode, indent } from "@/services/firebase/firestore/treeNode";
import { initialState, useStoreService } from "@/services/store";
import { addKeyDownEventListener } from "@/solid/event";
import { styles } from "@/styles.css";

declare module "@/services/store" {
  interface State {
    lifeLogs: {
      selectedId: string;
    };
  }
}

initialState.lifeLogs = {
  selectedId: "",
};

export function LifeLogTree(props: { id: string; prevId: string; nextId: string }) {
  const firebase = useFirebaseService();
  const { state, updateState } = useStoreService();

  const lifeLogsCol = getCollection(firebase, "lifeLogs");
  const lifeLogTreeNodesCol = getCollection(firebase, "lifeLogTreeNodes");
  const lifeLog$ = createSubscribeSignal(firebase, () => doc(lifeLogsCol, props.id));
  const isSelected$ = () => props.id === state.lifeLogs.selectedId;

  addKeyDownEventListener((event) => {
    if (!isSelected$()) return;

    const lifeLog = lifeLog$();
    if (!lifeLog) return;

    const { shiftKey, ctrlKey } = event;

    switch (event.code) {
      case "KeyL": {
        if (ctrlKey || shiftKey) return;

        event.stopImmediatePropagation();

        (async () => {
          const firstChildNode = await getFirstChildNode(lifeLogTreeNodesCol, lifeLog);
          if (!firstChildNode) return;

          updateState((state) => {
            state.lifeLogs.selectedId = firstChildNode.id;
          });
        })().catch((e: unknown) => {
          throw e;
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
  const childrenNodes$ = createSubscribeAllSignal(firebase, () =>
    query(lifeLogTreeNodesCol, where("parentId", "==", props.parentId)),
  );
  const childrenIds$ = createMemo(() => childrenNodes$().map((childNode) => childNode.id), [], { equals });

  createComputed(() => {
    childrenNodes$();
    console.timeStamp("childrenNodes updated");
  });

  createComputed(() => {
    console.timeStamp(`childrenIds updated ${JSON.stringify(childrenIds$())}`);
  });

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
  const node$ = createSubscribeSignal(firebase, () => doc(lifeLogTreeNodesCol, props.id));
  const isSelected$ = () => props.id === state.lifeLogs.selectedId;

  addKeyDownEventListener((event) => {
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

        (async () => {
          firebase.setClock(true);

          try {
            await runBatchWithLock(async (batch) => {
              if (shiftKey) {
                console.timeStamp("dedent");
                await dedent(batch, lifeLogTreeNodesCol, node);
              } else {
                console.timeStamp("indent");
                await indent(batch, lifeLogTreeNodesCol, node);
              }
            });
          } finally {
            console.timeStamp("transition begin");
            await startTransition(() => {
              firebase.setClock(false);
            });
            console.timeStamp("transition end");
          }
        })().catch((e: unknown) => {
          throw e;
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
