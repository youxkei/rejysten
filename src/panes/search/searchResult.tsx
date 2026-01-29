import { doc } from "firebase/firestore";
import { createEffect } from "solid-js";

import { getCollection, useFirestoreService } from "@/services/firebase/firestore";
import { createSubscribeSignal } from "@/services/firebase/firestore/subscribe";
import { scrollWithOffset } from "@/solid/scroll";
import { styles } from "@/styles.css";

export function SearchResult(props: { ngramId: string; isSelected: boolean }) {
  const firestore = useFirestoreService();
  const ngramsCol = getCollection(firestore, "ngrams");

  const ngram$ = createSubscribeSignal(
    firestore,
    () => doc(ngramsCol, props.ngramId),
    () => `ngram "${props.ngramId}"`,
  );

  let resultRef: HTMLDivElement | undefined;

  createEffect(() => {
    if (props.isSelected && resultRef) {
      scrollWithOffset(resultRef);
    }
  });

  return (
    <div ref={resultRef} class={`${styles.search.result} ${props.isSelected ? styles.search.resultSelected : ""}`}>
      <span class={styles.search.resultCollection}>{ngram$()?.collection}</span>
      <span class={styles.search.resultText}>{ngram$()?.text}</span>
    </div>
  );
}
