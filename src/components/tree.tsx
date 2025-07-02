import equals from "fast-deep-equal";
import { type CollectionReference, doc, query, where } from "firebase/firestore";
import { type Accessor, createComputed, createMemo, For, type JSXElement, Show, startTransition } from "solid-js";

import { type DocumentData, getDoc, useFirestoreService } from "@/services/firebase/firestore";
import { runBatch } from "@/services/firebase/firestore/batch";
import { createSubscribeAllSignal, createSubscribeSignal } from "@/services/firebase/firestore/subscribe";
import { dedent, indent, type TreeNode } from "@/services/firebase/firestore/treeNode";
import { addKeyDownEventListener } from "@/solid/event";

export function ChildrenNodes<T extends TreeNode>(props: {
  col: CollectionReference<T>;
  parentId: string;
  selectedId: string;
  setSelectedId: (selectedID: string) => void;
  showNode: (node$: Accessor<DocumentData<T>>, isSelected$: Accessor<boolean>) => JSXElement;
  isEditing?: Accessor<boolean>;
}) {
  const firestore = useFirestoreService();

  const childrenNodes$ = createSubscribeAllSignal(firestore, () =>
    query(props.col, where("parentId", "==", props.parentId)),
  );
  const sortedChildrenNodes$ = () => {
    const childrenNodes = childrenNodes$();

    const nodeMap = new Map<string, DocumentData<T>>();
    let firstNode: DocumentData<T> | undefined;

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
            <Node
              col={props.col}
              id={childId}
              selectedId={props.selectedId}
              setSelectedId={props.setSelectedId}
              showNode={props.showNode}
              isEditing={props.isEditing}
            />
          </li>
        )}
      </For>
    </ul>
  );
}

export function Node<T extends TreeNode>(props: {
  col: CollectionReference<T>;
  id: string;
  selectedId: string;
  setSelectedId: (selectedId: string) => void;
  showNode: (node$: Accessor<DocumentData<T>>, isSelected$: Accessor<boolean>) => JSXElement;
  isEditing?: Accessor<boolean>;
}) {
  const firestore = useFirestoreService();

  const node$ = createSubscribeSignal(firestore, () => doc(props.col, props.id));
  const isSelected$ = () => props.id === props.selectedId;

  addKeyDownEventListener(async (event) => {
    if (!isSelected$() || props.isEditing?.()) return;

    const { shiftKey, ctrlKey, isComposing } = event;

    switch (event.code) {
      case "KeyJ": {
        if (ctrlKey || shiftKey || isComposing) return;

        event.stopImmediatePropagation();

        const node = await getDoc(firestore, props.col, props.id);
        if (!node) return;

        if (node.belowId === "") return;

        props.setSelectedId(node.belowId);

        break;
      }

      case "KeyK": {
        if (ctrlKey || shiftKey || isComposing) return;

        event.stopImmediatePropagation();

        const node = await getDoc(firestore, props.col, props.id);
        if (!node) return;

        if (node.aboveId === "") return;

        props.setSelectedId(node.aboveId);

        break;
      }

      case "Tab": {
        if (ctrlKey || isComposing) return;

        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();

        const node = await getDoc(firestore, props.col, props.id);
        if (!node) return;

        try {
          firestore.setClock(true);
          await runBatch(firestore, async (batch) => {
            if (shiftKey) {
              console.timeStamp("dedent");
              await dedent(firestore, batch, props.col, node);
            } else {
              console.timeStamp("indent");
              await indent(firestore, batch, props.col, node);
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
      {(node$) => {
        return (
          <>
            <div>{props.showNode(node$, isSelected$)}</div>
            <ChildrenNodes
              col={props.col}
              parentId={props.id}
              selectedId={props.selectedId}
              setSelectedId={props.setSelectedId}
              showNode={props.showNode}
            />
          </>
        );
      }}
    </Show>
  );
}
