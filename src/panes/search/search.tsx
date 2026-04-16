import { Key } from "@solid-primitives/keyed";
import { query, where } from "firebase/firestore";
import { Show, createEffect, createMemo, createSignal, on, onCleanup, onMount, startTransition } from "solid-js";

import { analyzeTextForNgrams } from "@/ngram";
import { SearchMobileToolbar } from "@/panes/search/mobileToolbar";
import { SearchResult } from "@/panes/search/searchResult";
import "@/panes/store";
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

  // Query Firestore with all ngrams
  const results$ = createSubscribeAllSignal(
    firestore,
    () => {
      const ngrams = queryNgrams$();
      if (ngrams.length === 0) return undefined;

      // Query with all ngrams
      let q = query(ngramsCol);
      for (const ngram of ngrams) {
        q = query(q, where(`ngramMap.${ngram}`, "==", true));
      }
      return q;
    },
    () => `search ngrams`,
  );

  const resultIds$ = createMemo(() => {
    return results$()
      .map((r) => r.id)
      .toReversed();
  });

  // Track whether we're waiting for search results
  const [isSearchPending, setIsSearchPending] = createSignal(false);

  createEffect(() => {
    const ngrams = queryNgrams$();
    setIsSearchPending(ngrams.length > 0);
  });

  createEffect(
    on(
      results$,
      () => {
        setIsSearchPending(false);
      },
      { defer: true },
    ),
  );

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
    if (state.activePane !== "search") return;

    // Only handle navigation keys when input is not focused
    const inputFocused = document.activeElement === inputRef;

    if (event.key === "Escape") {
      event.preventDefault();
      if (inputFocused) {
        inputRef.blur();
      } else {
        actions.closeSearch();
      }
      return;
    }

    if (event.key === "Enter") {
      event.preventDefault();
      actions.jumpToSelected();
      return;
    }

    // Navigation keys only when input is not focused
    if (!inputFocused) {
      if (event.code === "KeyI") {
        event.preventDefault();
        inputRef?.focus();
        inputRef?.setSelectionRange(0, 0);
        return;
      }

      if (event.code === "KeyA") {
        event.preventDefault();
        inputRef?.focus();
        const len = inputRef?.value.length ?? 0;
        inputRef?.setSelectionRange(len, len);
        return;
      }

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

  function handleInputKeyDown(_e: KeyboardEvent) {
    // Tab key handling removed - use Escape to blur input
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
      <Show when={queryNgrams$().length === 0 && state.panesSearch.query.length > 0}>
        <div class={styles.search.statusContainer}>
          <span class={styles.search.statusText}>2文字以上入力してください</span>
        </div>
      </Show>
      <Show when={isSearchPending() && queryNgrams$().length > 0}>
        <div class={styles.search.statusContainer}>
          <div class={styles.search.spinner} />
          <span class={styles.search.statusText}>検索中...</span>
        </div>
      </Show>
      <Show when={!isSearchPending() && queryNgrams$().length > 0}>
        <div class={styles.search.statusContainer}>
          <span class={styles.search.statusText}>{resultIds$().length}件</span>
        </div>
      </Show>
      <ScrollContainer class={styles.search.resultsContainer}>
        <ul class={styles.search.resultsList}>
          <Key each={resultIds$()} by={(id) => id}>
            {(id, index) => (
              <li>
                <SearchResult
                  ngramId={id()}
                  isSelected={state.panesSearch.selectedResultIndex === index()}
                  onSelect={() => {
                    const i = index();
                    void startTransition(() => {
                      updateState((s) => {
                        s.panesSearch.selectedResultIndex = i;
                      });
                    });
                  }}
                />
              </li>
            )}
          </Key>
        </ul>
      </ScrollContainer>
      <SearchMobileToolbar />
    </div>
  );
}
