import equals from "fast-deep-equal";
import { doc, query, where } from "firebase/firestore";
import { type Timestamp } from "firebase/firestore";
import { createComputed, createMemo, For, Show, startTransition } from "solid-js";

import { type DocumentData, getCollection, getDoc, runBatch, useFirestoreService } from "@/services/firebase/firestore";
import { type Schema } from "@/services/firebase/firestore/schema";
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

declare module "@/services/firebase/firestore/schema" {
  interface Schema {
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

initialState.lifeLogs = {
  selectedId: "",
};

export function LifeLogTree(props: { id: string; prevId: string; nextId: string }) {
  const firestore = useFirestoreService();
  const { state, updateState } = useStoreService();

  const lifeLogsCol = getCollection(firestore, "lifeLogs");
  const lifeLogTreeNodesCol = getCollection(firestore, "lifeLogTreeNodes");
  const lifeLog$ = createSubscribeSignal(firestore, () => doc(lifeLogsCol, props.id));
  const isSelected$ = () => props.id === state.lifeLogs.selectedId;

  addKeyDownEventListener(async (event) => {
    if (!isSelected$()) return;

    const { shiftKey, ctrlKey } = event;

    switch (event.code) {
      case "KeyL": {
        if (ctrlKey || shiftKey) return;

        event.stopImmediatePropagation();

        const lifeLog = await getDoc(firestore, lifeLogsCol, props.id);
        if (!lifeLog) return;

        const firstChildNode = await getFirstChildNode(firestore, lifeLogTreeNodesCol, lifeLog);
        if (!firstChildNode) return;

        updateState((state) => {
          state.lifeLogs.selectedId = firstChildNode.id;
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
  const firestore = useFirestoreService();

  const lifeLogTreeNodesCol = getCollection(firestore, "lifeLogTreeNodes");
  const childrenNodes$ = createSubscribeAllSignal(firestore, () =>
    query(lifeLogTreeNodesCol, where("parentId", "==", props.parentId)),
  );
  const sortedChildrenNodes$ = () => {
    const childrenNodes = childrenNodes$();

    const nodeMap = new Map<string, DocumentData<Schema["lifeLogTreeNodes"]>>();
    let firstNode: DocumentData<Schema["lifeLogTreeNodes"]> | undefined;

    for (const node of childrenNodes) {
      nodeMap.set(node.id, node);
      if (node.prevId === "") firstNode = node;
    }

    const sortedChildren = [];
    let currentNode = firstNode;
    while (currentNode) {
      sortedChildren.push(currentNode);
      currentNode = nodeMap.get(currentNode.nextId);
    }

    return sortedChildren;
  };
  const childrenIds$ = createMemo(() => sortedChildrenNodes$().map((childNode) => childNode.id), [], { equals });

  createComputed(() => {
    childrenNodes$();
    console.timeStamp(`childrenNodes of ${props.parentId} updated`);
  });

  createComputed(() => {
    console.timeStamp(`childrenIds of ${props.parentId} updated`);
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
  const firestore = useFirestoreService();
  const { state, updateState } = useStoreService();

  const lifeLogTreeNodesCol = getCollection(firestore, "lifeLogTreeNodes");
  const node$ = createSubscribeSignal(firestore, () => doc(lifeLogTreeNodesCol, props.id));
  const isSelected$ = () => props.id === state.lifeLogs.selectedId;

  addKeyDownEventListener(async (event) => {
    if (!isSelected$()) return;

    const { shiftKey, ctrlKey } = event;

    switch (event.code) {
      case "KeyJ": {
        if (ctrlKey || shiftKey) return;

        event.stopImmediatePropagation();

        const node = await getDoc(firestore, lifeLogTreeNodesCol, props.id);
        if (!node) return;

        if (node.belowId === "") return;

        updateState((state) => {
          state.lifeLogs.selectedId = node.belowId;
        });

        break;
      }

      case "KeyK": {
        if (ctrlKey || shiftKey) return;

        event.stopImmediatePropagation();

        const node = await getDoc(firestore, lifeLogTreeNodesCol, props.id);
        if (!node) return;

        if (node.aboveId === "") return;

        updateState((state) => {
          state.lifeLogs.selectedId = node.aboveId;
        });

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

        const node = await getDoc(firestore, lifeLogTreeNodesCol, props.id);
        if (!node) return;

        try {
          firestore.setClock(true);
          await runBatch(firestore, async (batch) => {
            if (shiftKey) {
              console.timeStamp("dedent");
              await dedent(firestore, batch, lifeLogTreeNodesCol, node);
            } else {
              console.timeStamp("indent");
              await indent(firestore, batch, lifeLogTreeNodesCol, node);
            }
          });
        } finally {
          console.timeStamp("transition begin");

          await startTransition(() => {
            firestore.setClock(false);
          });

          console.timeStamp("transition end");
        }
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
