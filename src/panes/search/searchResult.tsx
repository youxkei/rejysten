import { doc } from "firebase/firestore";
import { createEffect } from "solid-js";

import { type DocumentData, getCollection, useFirestoreService } from "@/services/firebase/firestore";
import { type Schema } from "@/services/firebase/firestore/schema";
import { createSubscribeSignal } from "@/services/firebase/firestore/subscribe";
import { scrollWithOffset } from "@/solid/scroll";
import { styles } from "@/styles.css";

export function SearchResult(props: {
  ngramId: string;
  isSelected: boolean;
  onSelect: () => void;
  fallbackNgram?: DocumentData<Schema["ngrams"]>;
}) {
  const firestore = useFirestoreService();
  const ngramsCol = getCollection(firestore, "ngrams");

  const subscribedNgram$ = createSubscribeSignal(
    firestore,
    () => (props.ngramId === "" ? undefined : doc(ngramsCol, props.ngramId)),
    () => `ngram "${props.ngramId}"`,
  );
  const ngram$ = () => subscribedNgram$() ?? props.fallbackNgram;

  let resultRef: HTMLDivElement | undefined;

  createEffect(() => {
    if (props.isSelected && resultRef) {
      scrollWithOffset(resultRef);
    }
  });

  return (
    <div
      ref={resultRef}
      class={`${styles.search.result} ${props.isSelected ? styles.search.resultSelected : ""}`}
      onClick={props.onSelect}
    >
      <span class={styles.search.resultCollection}>{ngram$()?.collection}</span>
      <span class={styles.search.resultText}>{ngram$()?.text}</span>
    </div>
  );
}
