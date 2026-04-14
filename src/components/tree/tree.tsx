import "@/components/tree/actions";

import equals from "fast-deep-equal";
import { doc, orderBy, query, where } from "firebase/firestore";
import { type Accessor, createEffect, createMemo, For, type JSXElement, onCleanup, Show } from "solid-js";

import { useActionsService } from "@/services/actions";
import {
  type DocumentData,
  type SchemaCollectionReference,
  useFirestoreService,
  widenSchemaCollectionRef,
} from "@/services/firebase/firestore";
import { type Schema } from "@/services/firebase/firestore/schema";
import { createSubscribeAllSignal, createSubscribeSignal } from "@/services/firebase/firestore/subscribe";
import { type TreeNode, type TreeNodeCollection } from "@/services/firebase/firestore/treeNode";
import { addKeyDownEventListener } from "@/solid/event";
import { scrollWithOffset } from "@/solid/scroll";

export function ChildrenNodes<C extends TreeNodeCollection>(props: {
  col: SchemaCollectionReference<C>;
  parentId: string;
  rootParentId: string;
  selectedId: string;
  setSelectedId: (selectedID: string) => void;
  showNode: (node$: Accessor<DocumentData<Schema[C]>>, isSelected$: Accessor<boolean>) => JSXElement;
  createNewNode: (newId: string, initialText?: string) => Omit<DocumentData<Schema[C]>, keyof TreeNode>;
}) {
  const firestore = useFirestoreService();

  const childrenNodes$ = createSubscribeAllSignal(
    firestore,
    () => query(props.col, where("parentId", "==", props.parentId), orderBy("order", "asc")),
    () => `children nodes of "${props.parentId}"`,
  );
  const childrenIds$ = createMemo(() => childrenNodes$().map((childNode) => childNode.id), [], { equals });

  // "__FIRST__" が選択された場合、最初の子ノードのIDに解決する
  createEffect(() => {
    const ids = childrenIds$();
    if (props.selectedId === "__FIRST__" && ids.length > 0) {
      props.setSelectedId(ids[0]);
    }
  });

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

export function Node<C extends TreeNodeCollection>(props: {
  col: SchemaCollectionReference<C>;
  id: string;
  rootParentId: string;
  selectedId: string;
  setSelectedId: (selectedId: string) => void;
  showNode: (node$: Accessor<DocumentData<Schema[C]>>, isSelected$: Accessor<boolean>) => JSXElement;
  createNewNode: (newId: string, initialText?: string) => Omit<DocumentData<Schema[C]>, keyof TreeNode>;
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
        ctx.components.tree.col = widenSchemaCollectionRef<TreeNodeCollection, C>(props.col);
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

  addKeyDownEventListener((event) => {
    if (event.isComposing || event.ctrlKey || !isSelected$()) return;

    const { shiftKey } = event;
    const actions = actionsService.components.tree;

    switch (event.code) {
      case "KeyJ": {
        if (shiftKey) return;
        event.stopImmediatePropagation();
        actions.navigateDown();
        break;
      }

      case "KeyK": {
        if (shiftKey) return;
        event.stopImmediatePropagation();
        actions.navigateUp();
        break;
      }

      case "KeyG": {
        event.stopImmediatePropagation();
        if (shiftKey) {
          actions.goToLast();
        } else {
          actions.goToFirst();
        }
        break;
      }

      case "Tab": {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();

        if (shiftKey) {
          actions.dedentNode();
        } else {
          actions.indentNode();
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
            <div
              ref={nodeRef}
              onClick={(e) => {
                // 編集中のinputをクリックした場合はフォーカス変更しない
                if (e.target instanceof HTMLInputElement) return;

                // 親のLifeLogコンテナのクリックイベントが発火しないようにする
                e.stopPropagation();

                props.setSelectedId(props.id);
              }}
            >
              {props.showNode(node$, isSelected$)}
            </div>
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
