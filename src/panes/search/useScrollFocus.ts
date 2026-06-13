import { createComputed, createEffect, on, untrack, type Accessor } from "solid-js";

import { useScrollContainer } from "@/solid/scroll";

/**
 * 描画中の検索結果一覧が変わった際（window拡張で上にアイテムが追加されるなど）、
 * アンカー要素（選択中の結果）のビューポート内での位置を保持するためスクロール補正するフック
 */
export function useScrollFocus(props: {
  renderedIds$: Accessor<string[]>;
  anchorElementId$: Accessor<string | undefined>;
}) {
  const container$ = useScrollContainer();

  let savedRelativeTop: number | undefined;

  // Step 1: DOM更新前にアンカー要素のコンテナ相対位置を保存
  createComputed(
    on(
      () => props.renderedIds$(),
      (newIds, oldIds) => {
        if (oldIds === undefined) return;

        // Same set of IDs = reorder — skip position save
        if (newIds.length === oldIds.length) {
          const oldSet = new Set(oldIds);
          if (newIds.every((id) => oldSet.has(id))) {
            savedRelativeTop = undefined;
            return;
          }
        }

        const anchorId = untrack(() => props.anchorElementId$());
        if (!anchorId) {
          savedRelativeTop = undefined;
          return;
        }
        const el = document.getElementById(anchorId);
        const container = container$();
        if (el && container) {
          savedRelativeTop = el.getBoundingClientRect().top - container.getBoundingClientRect().top;
        } else {
          savedRelativeTop = undefined;
        }
      },
    ),
  );

  // Step 2: DOM更新後にスクロール位置を補正して元の相対位置を復元
  createEffect(
    on(
      () => props.renderedIds$(),
      () => {
        if (savedRelativeTop === undefined) return;
        const anchorId = untrack(() => props.anchorElementId$());
        if (!anchorId) return;
        const el = document.getElementById(anchorId);
        const container = container$();
        if (el && container) {
          const currentRelativeTop = el.getBoundingClientRect().top - container.getBoundingClientRect().top;
          container.scrollTop += currentRelativeTop - savedRelativeTop;
        }
        savedRelativeTop = undefined;
      },
      { defer: true },
    ),
  );
}
