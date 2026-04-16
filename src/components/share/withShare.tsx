import { Show, type JSXElement } from "solid-js";

import { Share } from "@/components/share/share";
import "@/components/share/store";
import { useStoreService } from "@/services/store";

export function WithShare(props: { children: JSXElement }) {
  const { state, updateState } = useStoreService();

  const params = new URLSearchParams(window.location.search);
  if (params.has("title") || params.has("url") || params.has("text")) {
    updateState((s) => {
      s.share.isActive = true;
    });
  }

  return (
    <Show when={state.share.isActive} fallback={props.children}>
      <Share />
    </Show>
  );
}
