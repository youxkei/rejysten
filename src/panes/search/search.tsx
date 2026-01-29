import { Key } from "@solid-primitives/keyed";
import { query, where } from "firebase/firestore";
import { createEffect, createMemo, onCleanup, onMount, startTransition } from "solid-js";

import { analyzeTextForNgrams } from "@/ngram";
import { SearchResult } from "@/panes/search/searchResult";
import { useActionsService } from "@/services/actions";
import { getCollection, useFirestoreService } from "@/services/firebase/firestore";
import { createSubscribeAllSignal } from "@/services/firebase/firestore/subscribe";
import { useStoreService } from "@/services/store";
import { addKeyDownEventListener } from "@/solid/event";
import { ScrollContainer } from "@/solid/scroll";
import { styles } from "@/styles.css";

export function Search() {
  const firestore = useFirestoreService();
  const ngramsCol = getCollection(firestore, "ngrams");
  const { state, updateState } = useStoreService();
  const actionsService = useActionsService();
  const actions = actionsService.panes.search;

  let inputRef: HTMLInputElement | undefined;

  // Register focusInput callback
  onMount(() => {
    actionsService.updateContext((ctx) => {
      ctx.panes.search.focusInput = () => {
        inputRef?.focus();
      };
    });
  });

  onCleanup(() => {
    actionsService.updateContext((ctx) => {
      ctx.panes.search.focusInput = () => undefined;
    });
  });

  // Focus input on mount
  onMount(() => {
    if (inputRef) {
      inputRef.focus();
      inputRef.value = state.panesSearch.query;
    }
  });

  // Get ngrams from query
  const queryNgrams$ = createMemo(() => {
    const queryText = state.panesSearch.query;
    if (queryText.length < 2) return [];

    const { ngramMap } = analyzeTextForNgrams(queryText);
    return Object.keys(ngramMap);
  });

  // Query Firestore with the first ngram
  const rawResults$ = createSubscribeAllSignal(
    firestore,
    () => {
      const ngrams = queryNgrams$();
      if (ngrams.length === 0) return undefined;

      // Query with first ngram
      return query(ngramsCol, where(`ngramMap.${ngrams[0]}`, "==", true));
    },
    () => `search ngrams`,
  );

  // Filter results client-side for all required ngrams
  const filteredResults$ = createMemo(() => {
    const ngrams = queryNgrams$();
    if (ngrams.length === 0) return [];

    const results = rawResults$();
    if (ngrams.length === 1) return results;

    // Filter for documents that have all ngrams
    return results.filter((result) => {
      const ngramMap = result.ngramMap;
      return ngrams.every((ngram) => ngramMap[ngram] === true);
    });
  });

  const resultIds$ = createMemo(() => {
    queryNgrams$(); // FIXME: investigate why this is necessary for reactivity
    return filteredResults$().map((r) => r.id);
  });

  // Update actions context with result IDs
  createEffect(() => {
    const ids = resultIds$();
    actionsService.updateContext((ctx) => {
      ctx.panes.search.resultIds = ids;
      ctx.panes.search.resultCount = ids.length;
    });
  });

  // Keyboard handlers for results navigation
  addKeyDownEventListener((event) => {
    if (event.isComposing || event.ctrlKey) return;
    if (!state.panesSearch.isActive) return;

    // Only handle navigation keys when input is not focused
    const inputFocused = document.activeElement === inputRef;

    if (event.key === "Escape") {
      event.preventDefault();
      actions.closeSearch();
      return;
    }

    if (event.key === "Enter") {
      event.preventDefault();
      actions.jumpToSelected();
      return;
    }

    // Navigation keys only when input is not focused
    if (!inputFocused) {
      if (event.key === "j") {
        event.preventDefault();
        actions.navigateNext();
        return;
      }

      if (event.key === "k") {
        event.preventDefault();
        actions.navigatePrev();
        return;
      }

      if (event.key === "g" && !event.shiftKey) {
        event.preventDefault();
        actions.goToFirst();
        return;
      }

      if (event.key === "G" || (event.key === "g" && event.shiftKey)) {
        event.preventDefault();
        actions.goToLast();
        return;
      }
    }
  });

  function handleInput(e: InputEvent) {
    const target = e.currentTarget as HTMLInputElement;
    void startTransition(() => {
      updateState((s) => {
        s.panesSearch.query = target.value;
        s.panesSearch.selectedResultIndex = 0;
      });
    });
  }

  function handleInputKeyDown(e: KeyboardEvent) {
    // Blur input on Tab to enable j/k navigation
    if (e.key === "Tab") {
      e.preventDefault();
      inputRef?.blur();
    }
  }

  return (
    <div class={styles.search.wrapper}>
      <div class={styles.search.inputContainer}>
        <input
          ref={inputRef}
          type="text"
          class={styles.search.input}
          placeholder="Search..."
          onInput={handleInput}
          onKeyDown={handleInputKeyDown}
        />
      </div>
      <ScrollContainer class={styles.search.resultsContainer}>
        <ul class={styles.search.resultsList}>
          <Key each={resultIds$()} by={(id) => id}>
            {(id, index) => (
              <li>
                <SearchResult ngramId={id()} isSelected={state.panesSearch.selectedResultIndex === index()} />
              </li>
            )}
          </Key>
        </ul>
      </ScrollContainer>
    </div>
  );
}
