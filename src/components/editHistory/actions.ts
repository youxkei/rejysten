import { startTransition } from "solid-js";

import { awaitable } from "@/awaitableCallback";
import { actionsCreator, initialActionsContext } from "@/services/actions";
import { useFirestoreService } from "@/services/firebase/firestore";
import { getOptimisticHistoryHeadState } from "@/services/firebase/firestore/batch";
import {
  undo as undoEngine,
  redo as redoEngine,
  jumpTo as jumpToEngine,
  getChildren,
} from "@/services/firebase/firestore/editHistory";
import { useStoreService } from "@/services/store";

const optimisticHistoryReadOptions = { waitForPendingCommits: false } as const;

declare module "@/services/actions" {
  interface ComponentsActionsContext {
    editHistory: Record<string, never>;
  }

  interface ComponentsActions {
    editHistory: {
      undo: () => void;
      redo: () => void;
      redoAlternate: () => void;
      togglePanel: () => void;
      closePanel: () => void;
      jumpToNode: (nodeId: string) => void;
    };
  }
}

initialActionsContext.components.editHistory = {};

actionsCreator.components.editHistory = ({ components: { editHistory: _context } }, _actions) => {
  const firestore = useFirestoreService();
  const { updateState } = useStoreService();

  let lastRedoParentId: string | null = null;
  let lastRedoChildIndex = -1;

  function resetCycleState() {
    lastRedoParentId = null;
    lastRedoChildIndex = -1;
  }

  function getCurrentHeadId(): string {
    return getOptimisticHistoryHeadState(firestore).entryId;
  }

  async function doUndo() {
    firestore.setClock(true);
    try {
      const prevSelection = await undoEngine(firestore, optimisticHistoryReadOptions);
      await startTransition(() => {
        if (prevSelection && (prevSelection.lifeLogs || prevSelection.lifeLogTreeNodes)) {
          updateState((s) => {
            s.panesLifeLogs.selectedLifeLogId = prevSelection.lifeLogs ?? "";
            s.panesLifeLogs.selectedLifeLogNodeId = prevSelection.lifeLogTreeNodes ?? "";
          });
        }
        firestore.setClock(false);
      });
    } finally {
      firestore.setClock(false);
    }
  }

  async function doRedo() {
    resetCycleState();
    firestore.setClock(true);
    try {
      const nextSelection = await redoEngine(firestore, undefined, optimisticHistoryReadOptions);
      await startTransition(() => {
        if (nextSelection && (nextSelection.lifeLogs || nextSelection.lifeLogTreeNodes)) {
          updateState((s) => {
            s.panesLifeLogs.selectedLifeLogId = nextSelection.lifeLogs ?? "";
            s.panesLifeLogs.selectedLifeLogNodeId = nextSelection.lifeLogTreeNodes ?? "";
          });
        }
        firestore.setClock(false);
      });
    } finally {
      firestore.setClock(false);
    }
  }

  function togglePanel() {
    void startTransition(() => {
      updateState((state) => {
        state.editHistory.isPanelOpen = !state.editHistory.isPanelOpen;
      });
    });
  }

  function closePanel() {
    updateState((state) => {
      state.editHistory.isPanelOpen = false;
    });
  }

  async function doRedoAlternate() {
    firestore.setClock(true);
    try {
      let branchPointId: string;

      if (lastRedoParentId !== null) {
        // Cycling mode: undo back to the branch point, but only if not already there
        const currentHeadId = getCurrentHeadId();
        if (currentHeadId !== lastRedoParentId) {
          await undoEngine(firestore, optimisticHistoryReadOptions);
        }
        branchPointId = lastRedoParentId;
      } else {
        // First R press: we're at the branch point
        branchPointId = getCurrentHeadId();
      }

      const children = await getChildren(firestore, branchPointId, optimisticHistoryReadOptions);

      if (children.length <= 1) {
        // 0 or 1 child: behave like normal redo
        resetCycleState();
        const nextSelection = await redoEngine(firestore, undefined, optimisticHistoryReadOptions);
        await startTransition(() => {
          if (nextSelection && (nextSelection.lifeLogs || nextSelection.lifeLogTreeNodes)) {
            updateState((s) => {
              s.panesLifeLogs.selectedLifeLogId = nextSelection.lifeLogs ?? "";
              s.panesLifeLogs.selectedLifeLogNodeId = nextSelection.lifeLogTreeNodes ?? "";
            });
          }
          firestore.setClock(false);
        });
        return;
      }

      // Multiple children: cycle through them
      let nextIndex: number;
      if (lastRedoParentId === null) {
        // First R: start with second-newest (newest is what r picks)
        nextIndex = children.length - 2;
      } else {
        // Subsequent R: move to next older, wrap around
        nextIndex = lastRedoChildIndex - 1;
        if (nextIndex < 0) {
          nextIndex = children.length - 1;
        }
      }

      lastRedoParentId = branchPointId;
      lastRedoChildIndex = nextIndex;

      const nextSelection = await redoEngine(firestore, children[nextIndex].id, optimisticHistoryReadOptions);
      await startTransition(() => {
        if (nextSelection && (nextSelection.lifeLogs || nextSelection.lifeLogTreeNodes)) {
          updateState((s) => {
            s.panesLifeLogs.selectedLifeLogId = nextSelection.lifeLogs ?? "";
            s.panesLifeLogs.selectedLifeLogNodeId = nextSelection.lifeLogTreeNodes ?? "";
          });
        }
        firestore.setClock(false);
      });
    } finally {
      firestore.setClock(false);
    }
  }

  async function jumpToNode(nodeId: string) {
    resetCycleState();
    firestore.setClock(true);
    try {
      const selection = await jumpToEngine(firestore, nodeId, optimisticHistoryReadOptions);
      await startTransition(() => {
        if (selection && (selection.lifeLogs || selection.lifeLogTreeNodes)) {
          updateState((s) => {
            s.panesLifeLogs.selectedLifeLogId = selection.lifeLogs ?? "";
            s.panesLifeLogs.selectedLifeLogNodeId = selection.lifeLogTreeNodes ?? "";
          });
        }
        firestore.setClock(false);
      });
    } finally {
      firestore.setClock(false);
    }
  }

  return {
    undo: awaitable(doUndo),
    redo: awaitable(doRedo),
    redoAlternate: awaitable(doRedoAlternate),
    togglePanel,
    closePanel,
    jumpToNode: awaitable(jumpToNode),
  };
};
