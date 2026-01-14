import equals from "fast-deep-equal";
import { type CollectionReference, doc, orderBy, query, where } from "firebase/firestore";
import { type Accessor, createEffect, createMemo, For, type JSXElement, Show, startTransition } from "solid-js";

import { type DocumentData, getDoc, useFirestoreService } from "@/services/firebase/firestore";
import { runBatch } from "@/services/firebase/firestore/batch";
import { createSubscribeAllSignal, createSubscribeSignal } from "@/services/firebase/firestore/subscribe";
import {
  dedent,
  getAboveNode,
  getBelowNode,
  getBottomNodeExclusive,
  getFirstChildNode,
  indent,
  type TreeNode,
} from "@/services/firebase/firestore/treeNode";
import { addKeyDownEventListener } from "@/solid/event";
import { scrollWithOffset } from "@/solid/scroll";

export function ChildrenNodes<T extends TreeNode>(props: {
  col: CollectionReference<T>;
  parentId: string;
  rootParentId: string;
  selectedId: string;
  setSelectedId: (selectedID: string) => void;
  showNode: (
    node$: Accessor<DocumentData<T>>,
    isSelected$: Accessor<boolean>,
    handleTabIndent: (shiftKey: boolean) => Promise<void>,
  ) => JSXElement;
  createNewNode: (newId: string, initialText?: string) => Omit<DocumentData<T>, keyof TreeNode>;
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
              rootParentId={props.rootParentId}
              selectedId={props.selectedId}
              setSelectedId={props.setSelectedId}
              showNode={props.showNode}
              createNewNode={props.createNewNode}
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
  rootParentId: string;
  selectedId: string;
  setSelectedId: (selectedId: string) => void;
  showNode: (
    node$: Accessor<DocumentData<T>>,
    isSelected$: Accessor<boolean>,
    handleTabIndent: (shiftKey: boolean) => Promise<void>,
  ) => JSXElement;
  createNewNode: (newId: string, initialText?: string) => Omit<DocumentData<T>, keyof TreeNode>;
}) {
  const firestore = useFirestoreService();

  const node$ = createSubscribeSignal(
    firestore,
    () => doc(props.col, props.id),
    () => `node "${props.id}"`,
  );
  const isSelected$ = () => props.id === props.selectedId;

  let nodeRef: HTMLDivElement | undefined;
  createEffect(() => {
    if (isSelected$() && nodeRef) {
      scrollWithOffset(nodeRef);
    }
  });

  addKeyDownEventListener(async (event) => {
    if (event.isComposing || event.ctrlKey || !isSelected$()) return;

    const { shiftKey } = event;

    switch (event.code) {
      case "KeyJ": {
        if (shiftKey) return;

        event.stopImmediatePropagation();

        const node = await getDoc(firestore, props.col, props.id);
        if (!node) return;

        const belowNode = await getBelowNode(firestore, props.col, node);
        if (!belowNode) return;

        props.setSelectedId(belowNode.id);

        break;
      }

      case "KeyK": {
        if (shiftKey) return;

        event.stopImmediatePropagation();

        const node = await getDoc(firestore, props.col, props.id);
        if (!node) return;

        const aboveNode = await getAboveNode(firestore, props.col, node);
        if (!aboveNode) return;

        props.setSelectedId(aboveNode.id);

        break;
      }

      case "KeyG": {
        event.stopImmediatePropagation();

        if (shiftKey) {
          // G: move to the last tree node
          const lastNode = await getBottomNodeExclusive(firestore, props.col, { id: props.rootParentId });
          if (!lastNode || lastNode.id === props.id) return;
          props.setSelectedId(lastNode.id);
        } else {
          // g: move to the first tree node
          const firstNode = await getFirstChildNode(firestore, props.col, { id: props.rootParentId });
          if (!firstNode || firstNode.id === props.id) return;
          props.setSelectedId(firstNode.id);
        }

        break;
      }

      case "Tab": {
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
    }
  });

  async function handleTabIndent(shiftKey: boolean): Promise<void> {
    const node = await getDoc(firestore, props.col, props.id);
    if (!node) return;

    try {
      firestore.setClock(true);
      await runBatch(firestore, async (batch) => {
        if (shiftKey) {
          await dedent(firestore, batch, props.col, node);
        } else {
          await indent(firestore, batch, props.col, node);
        }
      });

      await startTransition(() => {
        firestore.setClock(false);
      });
    } finally {
      firestore.setClock(false);
    }
  }

  return (
    <Show when={node$()}>
      {(node$) => {
        return (
          <>
            <div ref={nodeRef}>{props.showNode(node$, isSelected$, handleTabIndent)}</div>
            <ChildrenNodes
              col={props.col}
              parentId={props.id}
              rootParentId={props.rootParentId}
              selectedId={props.selectedId}
              setSelectedId={props.setSelectedId}
              showNode={props.showNode}
              createNewNode={props.createNewNode}
            />
          </>
        );
      }}
    </Show>
  );
}
