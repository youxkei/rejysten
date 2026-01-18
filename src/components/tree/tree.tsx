import "@/components/tree/actions";

import equals from "fast-deep-equal";
import { type CollectionReference, doc, orderBy, query, where } from "firebase/firestore";
import { type Accessor, createEffect, createMemo, For, type JSXElement, onCleanup, Show } from "solid-js";

import { awaitable } from "@/awaitableCallback";
import { useActionsService } from "@/services/actions";
import { type DocumentData, useFirestoreService } from "@/services/firebase/firestore";
import { createSubscribeAllSignal, createSubscribeSignal } from "@/services/firebase/firestore/subscribe";
import { type TreeNode } from "@/services/firebase/firestore/treeNode";
import { addKeyDownEventListener } from "@/solid/event";
import { scrollWithOffset } from "@/solid/scroll";

export function ChildrenNodes<T extends TreeNode>(props: {
  col: CollectionReference<T>;
  parentId: string;
  rootParentId: string;
  selectedId: string;
  setSelectedId: (selectedID: string) => void;
  showNode: (node$: Accessor<DocumentData<T>>, isSelected$: Accessor<boolean>) => JSXElement;
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
  showNode: (node$: Accessor<DocumentData<T>>, isSelected$: Accessor<boolean>) => JSXElement;
  createNewNode: (newId: string, initialText?: string) => Omit<DocumentData<T>, keyof TreeNode>;
}) {
  const firestore = useFirestoreService();
  const actionsService = useActionsService();

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

  // Update actions context when this node is selected
  createEffect(() => {
    if (isSelected$()) {
      actionsService.updateContext((ctx) => {
        ctx.components.tree.selectedId = props.id;
        ctx.components.tree.rootParentId = props.rootParentId;
        ctx.components.tree.col = props.col;
        ctx.components.tree.setSelectedId = props.setSelectedId;
      });
    }
  });

  onCleanup(() => {
    if (isSelected$()) {
      actionsService.updateContext((ctx) => {
        ctx.components.tree.selectedId = "";
        ctx.components.tree.rootParentId = "";
        ctx.components.tree.col = null;
        ctx.components.tree.setSelectedId = () => undefined;
      });
    }
  });

  addKeyDownEventListener(
    awaitable(async (event) => {
      if (event.isComposing || event.ctrlKey || !isSelected$()) return;

      const { shiftKey } = event;
      const actions = actionsService.components.tree;

      switch (event.code) {
        case "KeyJ": {
          if (shiftKey) return;
          event.stopImmediatePropagation();
          await actions.navigateDown();
          break;
        }

        case "KeyK": {
          if (shiftKey) return;
          event.stopImmediatePropagation();
          await actions.navigateUp();
          break;
        }

        case "KeyG": {
          event.stopImmediatePropagation();
          if (shiftKey) {
            await actions.goToLast();
          } else {
            await actions.goToFirst();
          }
          break;
        }

        case "Tab": {
          event.preventDefault();
          event.stopPropagation();
          event.stopImmediatePropagation();

          if (shiftKey) {
            await actions.dedentNode();
          } else {
            await actions.indentNode();
          }
          break;
        }
      }
    }),
  );

  return (
    <Show when={node$()}>
      {(node$) => {
        return (
          <>
            <div ref={nodeRef}>{props.showNode(node$, isSelected$)}</div>
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
