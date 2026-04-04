import { createComputed, createEffect, on, untrack, type Accessor } from "solid-js";

import { useStoreService } from "@/services/store";
import { useScrollContainer } from "@/solid/scroll";

/**
 * lifeLogs一覧が変わった際（レンジ展開/リセットで上にアイテムが追加/削除されるなど）、
 * 選択中のlifeLogのビューポート内での位置を保持するためスクロール補正するフック
 */
export function useScrollFocus(props: { lifeLogIds$: Accessor<string[]> }) {
  const container$ = useScrollContainer();
  const { state } = useStoreService();

  let savedRelativeTop: number | undefined;

  // Step 1: DOM更新前に選択中要素のコンテナ相対位置を保存
  createComputed(
    on(
      () => props.lifeLogIds$(),
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

        const selectedId = untrack(() => state.panesLifeLogs.selectedLifeLogId);
        if (!selectedId) {
          savedRelativeTop = undefined;
          return;
        }
        const el = document.getElementById(selectedId);
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
      () => props.lifeLogIds$(),
      () => {
        if (savedRelativeTop === undefined) return;
        const selectedId = untrack(() => state.panesLifeLogs.selectedLifeLogId);
        if (!selectedId) return;
        const el = document.getElementById(selectedId);
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
