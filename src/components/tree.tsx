import equals from "fast-deep-equal";
import { type CollectionReference, doc, orderBy, query, where } from "firebase/firestore";
import { type Accessor, createMemo, For, type JSXElement, Show, startTransition } from "solid-js";
import { uuidv7 } from "uuidv7";

import { type DocumentData, getDoc, useFirestoreService } from "@/services/firebase/firestore";
import { runBatch } from "@/services/firebase/firestore/batch";
import { createSubscribeAllSignal, createSubscribeSignal } from "@/services/firebase/firestore/subscribe";
import {
  addNextSibling,
  addPrevSibling,
  dedent,
  getAboveNode,
  getBelowNode,
  indent,
  type TreeNode,
} from "@/services/firebase/firestore/treeNode";
import { addKeyDownEventListener } from "@/solid/event";

export function ChildrenNodes<T extends TreeNode>(props: {
  col: CollectionReference<T>;
  parentId: string;
  selectedId: string;
  setSelectedId: (selectedID: string) => void;
  showNode: (node$: Accessor<DocumentData<T>>, isSelected$: Accessor<boolean>) => JSXElement;
  createNewNode: (newId: string) => Omit<DocumentData<T>, keyof TreeNode>;
  isEditing?: Accessor<boolean>;
  setIsEditing?: (isEditing: boolean) => void;
}) {
  const firestore = useFirestoreService();

  const childrenNodes$ = createSubscribeAllSignal(
    firestore,
    () => query(props.col, where("parentId", "==", props.parentId), orderBy("order", "asc")),
    () => `children nodes of "${props.parentId}"`,
  );
  const childrenIds$ = createMemo(() => childrenNodes$().map((childNode) => childNode.id), [], { equals });

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
              createNewNode={props.createNewNode}
              isEditing={props.isEditing}
              setIsEditing={props.setIsEditing}
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
  createNewNode: (newId: string) => Omit<DocumentData<T>, keyof TreeNode>;
  isEditing?: Accessor<boolean>;
  setIsEditing?: (isEditing: boolean) => void;
}) {
  const firestore = useFirestoreService();

  const node$ = createSubscribeSignal(
    firestore,
    () => doc(props.col, props.id),
    () => `node "${props.id}"`,
  );
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

        const belowNode = await getBelowNode(firestore, props.col, node);
        if (!belowNode) return;

        props.setSelectedId(belowNode.id);

        break;
      }

      case "KeyK": {
        if (ctrlKey || shiftKey || isComposing) return;

        event.stopImmediatePropagation();

        const node = await getDoc(firestore, props.col, props.id);
        if (!node) return;

        const aboveNode = await getAboveNode(firestore, props.col, node);
        if (!aboveNode) return;

        props.setSelectedId(aboveNode.id);

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

          console.timeStamp("transition begin");
          await startTransition(() => {
            firestore.setClock(false);
          });
          console.timeStamp("transition end");
        } finally {
          firestore.setClock(false);
        }

        break;
      }

      case "KeyO": {
        if (ctrlKey || isComposing) return;

        event.stopImmediatePropagation();

        const node = await getDoc(firestore, props.col, props.id);
        if (!node) return;

        const newNodeId = uuidv7();

        try {
          firestore.setClock(true);
          await runBatch(firestore, async (batch) => {
            if (shiftKey) {
              // Shift+O: add above
              await addPrevSibling(firestore, batch, props.col, node, props.createNewNode(newNodeId));
            } else {
              // o: add below
              await addNextSibling<T>(firestore, batch, props.col, node, props.createNewNode(newNodeId));
            }
          });

          console.timeStamp("transition begin");
          await startTransition(() => {
            props.setSelectedId(newNodeId);
            props.setIsEditing?.(true);
            firestore.setClock(false);
          });
          console.timeStamp("transition end");
        } finally {
          firestore.setClock(false);
        }

        break;
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
              createNewNode={props.createNewNode}
              isEditing={props.isEditing}
              setIsEditing={props.setIsEditing}
            />
          </>
        );
      }}
    </Show>
  );
}
