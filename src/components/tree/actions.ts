import { type CollectionReference } from "firebase/firestore";
import { startTransition } from "solid-js";

import { actionsCreator, initialActionsContext } from "@/services/actions";
import { getDoc, useFirestoreService } from "@/services/firebase/firestore";
import { runBatch } from "@/services/firebase/firestore/batch";
import {
  dedent,
  getAboveNode,
  getBelowNode,
  getBottomNodeExclusive,
  getFirstChildNode,
  indent,
  type TreeNode,
} from "@/services/firebase/firestore/treeNode";

declare module "@/services/actions" {
  interface ComponentnsActionsContext {
    tree: {
      selectedId: string;
      rootParentId: string;
      col: CollectionReference | null;
      setSelectedId: (id: string) => void;
    };
  }

  interface ComponentnsActions {
    tree: {
      navigateDown: () => Promise<void>;
      navigateUp: () => Promise<void>;
      goToFirst: () => Promise<void>;
      goToLast: () => Promise<void>;
      indentNode: () => Promise<void>;
      dedentNode: () => Promise<void>;
    };
  }
}

initialActionsContext.components.tree = {
  selectedId: "",
  rootParentId: "",
  col: null,
  setSelectedId: () => undefined,
};

actionsCreator.components.tree = ({ components: { tree: context } }) => {
  const firestore = useFirestoreService();

  async function navigateDown() {
    if (!context.col || context.selectedId === "") return;

    const node = await getDoc(firestore, context.col as CollectionReference<TreeNode>, context.selectedId);
    if (!node) return;

    const belowNode = await getBelowNode(firestore, context.col as CollectionReference<TreeNode>, node);
    if (!belowNode) return;

    context.setSelectedId(belowNode.id);
  }

  async function navigateUp() {
    if (!context.col || context.selectedId === "") return;

    const node = await getDoc(firestore, context.col as CollectionReference<TreeNode>, context.selectedId);
    if (!node) return;

    const aboveNode = await getAboveNode(firestore, context.col as CollectionReference<TreeNode>, node);
    if (!aboveNode) return;

    context.setSelectedId(aboveNode.id);
  }

  async function goToFirst() {
    if (!context.col || context.rootParentId === "") return;

    const firstNode = await getFirstChildNode(firestore, context.col as CollectionReference<TreeNode>, {
      id: context.rootParentId,
    });
    if (!firstNode || firstNode.id === context.selectedId) return;

    context.setSelectedId(firstNode.id);
  }

  async function goToLast() {
    if (!context.col || context.rootParentId === "") return;

    const lastNode = await getBottomNodeExclusive(firestore, context.col as CollectionReference<TreeNode>, {
      id: context.rootParentId,
    });
    if (!lastNode || lastNode.id === context.selectedId) return;

    context.setSelectedId(lastNode.id);
  }

  async function indentNode() {
    if (!context.col || context.selectedId === "") return;

    const node = await getDoc(firestore, context.col as CollectionReference<TreeNode>, context.selectedId);
    if (!node) return;

    try {
      firestore.setClock(true);
      await runBatch(firestore, async (batch) => {
        await indent(firestore, batch, context.col as CollectionReference<TreeNode>, node);
      });

      await startTransition(() => {
        firestore.setClock(false);
      });
    } finally {
      firestore.setClock(false);
    }
  }

  async function dedentNode() {
    if (!context.col || context.selectedId === "") return;

    const node = await getDoc(firestore, context.col as CollectionReference<TreeNode>, context.selectedId);
    if (!node) return;

    try {
      firestore.setClock(true);
      await runBatch(firestore, async (batch) => {
        await dedent(firestore, batch, context.col as CollectionReference<TreeNode>, node);
      });

      await startTransition(() => {
        firestore.setClock(false);
      });
    } finally {
      firestore.setClock(false);
    }
  }

  return {
    navigateDown,
    navigateUp,
    goToFirst,
    goToLast,
    indentNode,
    dedentNode,
  };
};
