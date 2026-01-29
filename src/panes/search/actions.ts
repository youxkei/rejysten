import { startTransition } from "solid-js";

import { awaitable } from "@/awaitableCallback";
import { type Actions, actionsCreator, initialActionsContext } from "@/services/actions";
import { getCollection, getDoc, useFirestoreService } from "@/services/firebase/firestore";
import { useStoreService } from "@/services/store";

declare module "@/services/actions" {
  interface PanesActionsContext {
    search: {
      resultIds: string[];
      resultCount: number;
      setResultIds: (ids: string[]) => void;
      focusInput: () => void;
    };
  }

  interface PanesActions {
    search: {
      openSearch: () => void;
      closeSearch: () => void;
      navigateNext: () => void;
      navigatePrev: () => void;
      goToFirst: () => void;
      goToLast: () => void;
      jumpToSelected: () => void;
    };
  }
}

initialActionsContext.panes.search = {
  resultIds: [],
  resultCount: 0,
  setResultIds: () => undefined,
  focusInput: () => undefined,
};

actionsCreator.panes.search = ({ panes: { search: context } }, _actions: Actions) => {
  const { state, updateState } = useStoreService();
  const firestore = useFirestoreService();

  const openSearch = awaitable(async () => {
    await startTransition(() => {
      updateState((s) => {
        s.panesSearch.isActive = true;
        s.panesSearch.query = "";
        s.panesSearch.selectedResultIndex = 0;
      });
    });
    // Focus input after state update
    requestAnimationFrame(() => {
      context.focusInput();
    });
  });

  const closeSearch = awaitable(async () => {
    await startTransition(() => {
      updateState((s) => {
        s.panesSearch.isActive = false;
        s.panesSearch.query = "";
        s.panesSearch.selectedResultIndex = 0;
      });
    });
  });

  const navigateNext = awaitable(async () => {
    if (context.resultCount === 0) return;
    await startTransition(() => {
      updateState((s) => {
        if (s.panesSearch.selectedResultIndex < context.resultCount - 1) {
          s.panesSearch.selectedResultIndex += 1;
        }
      });
    });
  });

  const navigatePrev = awaitable(async () => {
    if (context.resultCount === 0) return;
    await startTransition(() => {
      updateState((s) => {
        if (s.panesSearch.selectedResultIndex > 0) {
          s.panesSearch.selectedResultIndex -= 1;
        }
      });
    });
  });

  const goToFirst = awaitable(async () => {
    if (context.resultCount === 0) return;
    await startTransition(() => {
      updateState((s) => {
        s.panesSearch.selectedResultIndex = 0;
      });
    });
  });

  const goToLast = awaitable(async () => {
    if (context.resultCount === 0) return;
    await startTransition(() => {
      updateState((s) => {
        s.panesSearch.selectedResultIndex = context.resultCount - 1;
      });
    });
  });

  const jumpToSelected = awaitable(async () => {
    if (context.resultCount === 0) return;

    const selectedIndex = state.panesSearch.selectedResultIndex;
    const ngramId = context.resultIds[selectedIndex];
    if (!ngramId) return;

    const ngramsCol = getCollection(firestore, "ngrams");
    const ngram = await getDoc(firestore, ngramsCol, ngramId);
    if (!ngram) return;

    const collectionName = ngram.collection;
    const docId = ngramId.slice(0, -collectionName.length);

    if (collectionName === "lifeLogs") {
      await startTransition(() => {
        updateState((s) => {
          s.panesLifeLogs.selectedLifeLogId = docId;
          s.panesLifeLogs.selectedLifeLogNodeId = "";
          s.panesSearch.isActive = false;
          s.panesSearch.query = "";
          s.panesSearch.selectedResultIndex = 0;
        });
      });
    } else if (collectionName === "lifeLogTreeNodes") {
      const treeNodesCol = getCollection(firestore, "lifeLogTreeNodes");
      const treeNode = await getDoc(firestore, treeNodesCol, docId);
      if (!treeNode) return;

      await startTransition(() => {
        updateState((s) => {
          s.panesLifeLogs.selectedLifeLogId = treeNode.lifeLogId;
          s.panesLifeLogs.selectedLifeLogNodeId = docId;
          s.panesSearch.isActive = false;
          s.panesSearch.query = "";
          s.panesSearch.selectedResultIndex = 0;
        });
      });
    }
  });

  return {
    openSearch,
    closeSearch,
    navigateNext,
    navigatePrev,
    goToFirst,
    goToLast,
    jumpToSelected,
  };
};
