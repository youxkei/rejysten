import { startTransition } from "solid-js";

import { awaitable } from "@/awaitableCallback";
import { actionsCreator, initialActionsContext } from "@/services/actions";
import { type SchemaCollectionReference, getDoc, useFirestoreService } from "@/services/firebase/firestore";
import { runBatch } from "@/services/firebase/firestore/batch";
import { buildSelection } from "@/services/firebase/firestore/editHistory/schema";
import {
  type TreeNodeCollection,
  dedent,
  getAboveNode,
  getBelowNode,
  getBottomNodeExclusive,
  getFirstChildNode,
  indent,
} from "@/services/firebase/firestore/treeNode";
import { useStoreService } from "@/services/store";

declare module "@/services/actions" {
  interface ComponentsActionsContext {
    tree: {
      selectedId: string;
      rootParentId: string;
      col: SchemaCollectionReference<TreeNodeCollection> | null;
      setSelectedId: (id: string) => void;
    };
  }

  interface ComponentsActions {
    tree: {
      navigateDown: () => void;
      navigateUp: () => void;
      goToFirst: () => void;
      goToLast: () => void;
      indentNode: () => void;
      dedentNode: () => void;
    };
  }
}

initialActionsContext.components.tree = {
  selectedId: "",
  rootParentId: "",
  col: null,
  setSelectedId: () => undefined,
};

actionsCreator.components.tree = ({ components: { tree: context } }, _actions) => {
  const firestore = useFirestoreService();
  const { state } = useStoreService();

  function currentSelection() {
    return buildSelection(state);
  }

  async function navigateDown() {
    if (!context.col || context.selectedId === "") return;

    const node = await getDoc(firestore, context.col, context.selectedId);
    if (!node) return;

    const belowNode = await getBelowNode(firestore, context.col, node);
    if (!belowNode) return;

    context.setSelectedId(belowNode.id);
  }

  async function navigateUp() {
    if (!context.col || context.selectedId === "") return;

    const node = await getDoc(firestore, context.col, context.selectedId);
    if (!node) return;

    const aboveNode = await getAboveNode(firestore, context.col, node);
    if (!aboveNode) return;

    context.setSelectedId(aboveNode.id);
  }

  async function goToFirst() {
    if (!context.col || context.rootParentId === "") return;

    const firstNode = await getFirstChildNode(firestore, context.col, {
      id: context.rootParentId,
    });
    if (!firstNode || firstNode.id === context.selectedId) return;

    context.setSelectedId(firstNode.id);
  }

  async function goToLast() {
    if (!context.col || context.rootParentId === "") return;

    const lastNode = await getBottomNodeExclusive(firestore, context.col, {
      id: context.rootParentId,
    });
    if (!lastNode || lastNode.id === context.selectedId) return;

    context.setSelectedId(lastNode.id);
  }

  async function indentNode() {
    if (!context.col || context.selectedId === "") return;
    const col = context.col;

    const node = await getDoc(firestore, col, context.selectedId);
    if (!node) return;

    try {
      firestore.setClock(true);
      await runBatch(
        firestore,
        async (batch) => {
          await indent(firestore, batch, col, node);
        },
        { description: "インデント変更", prevSelection: currentSelection() },
      );

      await startTransition(() => {
        firestore.setClock(false);
      });
    } finally {
      firestore.setClock(false);
    }
  }

  async function dedentNode() {
    if (!context.col || context.selectedId === "") return;
    const col = context.col;

    const node = await getDoc(firestore, col, context.selectedId);
    if (!node) return;

    try {
      firestore.setClock(true);
      await runBatch(
        firestore,
        async (batch) => {
          await dedent(firestore, batch, col, node);
        },
        { description: "インデント変更", prevSelection: currentSelection() },
      );

      await startTransition(() => {
        firestore.setClock(false);
      });
    } finally {
      firestore.setClock(false);
    }
  }

  return {
    navigateDown: awaitable(navigateDown),
    navigateUp: awaitable(navigateUp),
    goToFirst: awaitable(goToFirst),
    goToLast: awaitable(goToLast),
    indentNode: awaitable(indentNode),
    dedentNode: awaitable(dedentNode),
  };
};
