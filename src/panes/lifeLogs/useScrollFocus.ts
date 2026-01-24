import { debounce } from "@solid-primitives/scheduled";
import { createEffect, onCleanup, type Accessor } from "solid-js";

import { useStoreService } from "@/services/store";
import { createIsMobile } from "@/solid/responsive";
import { isElementFullyVisible, isElementVisible, useScrollContainer } from "@/solid/scroll";

/**
 * スクロール時にフォーカス中のLifeLogが見えなくなったら、見えているLifeLogにフォーカスを移動するフック
 * 編集中は動作しない
 */
export function useScrollFocus(props: {
  lifeLogIds$: Accessor<string[]>;
  isEditing$: Accessor<boolean>;
  debounceMs?: number;
}) {
  const container$ = useScrollContainer();
  const { state, updateState } = useStoreService();
  const isMobile$ = createIsMobile();

  const debouncedUpdateState = debounce((newTargetId: string, selectedNodeId: string) => {
    updateState((s) => {
      s.panesLifeLogs.selectedLifeLogId = newTargetId;
      // ツリーフォーカス中の場合、ツリーから抜ける
      if (selectedNodeId) {
        s.panesLifeLogs.selectedLifeLogNodeId = "";
      }
    });
  }, props.debounceMs ?? 300);

  const handleScroll = () => {
    // 編集中はスキップ
    if (props.isEditing$()) return;

    const container = container$();
    if (!container) return;

    const selectedId = state.panesLifeLogs.selectedLifeLogId;
    const selectedNodeId = state.panesLifeLogs.selectedLifeLogNodeId;

    // ツリーフォーカス中の場合、選択中のLifeLogを基準にする
    const targetId = selectedId;
    if (!targetId) return;

    const selectedElement = document.getElementById(targetId);
    if (!selectedElement) return;

    const visibility = isElementVisible(container, selectedElement);
    if (visibility === "visible") return;

    // フォーカスが見えなくなった場合、見えているLifeLogを探す
    const ids = props.lifeLogIds$();
    let newTargetId: string | undefined;

    const isMobile = isMobile$();

    // モバイルでは column-reverse により表示が逆なので、探索方向も逆にする
    // デスクトップ: "above" → 順方向, "below" → 逆方向
    // モバイル:     "above" → 逆方向, "below" → 順方向
    const shouldIterateForward = isMobile ? visibility === "below" : visibility === "above";

    // 二段階の探索: まず完全に見えている要素を探し、なければ部分的に見えている要素を探す
    // 完全に見えている要素を選べば scrollWithOffset が発火しないため、不要なスクロールを防げる
    let partiallyVisibleId: string | undefined;

    if (shouldIterateForward) {
      for (const id of ids) {
        const el = document.getElementById(id);
        if (el && isElementVisible(container, el) === "visible") {
          if (isElementFullyVisible(container, el)) {
            newTargetId = id;
            break;
          } else if (!partiallyVisibleId) {
            partiallyVisibleId = id;
          }
        }
      }
    } else {
      for (let i = ids.length - 1; i >= 0; i--) {
        const el = document.getElementById(ids[i]);
        if (el && isElementVisible(container, el) === "visible") {
          if (isElementFullyVisible(container, el)) {
            newTargetId = ids[i];
            break;
          } else if (!partiallyVisibleId) {
            partiallyVisibleId = ids[i];
          }
        }
      }
    }

    // 完全に見えている要素がなければ、部分的に見えている要素にフォールバック
    if (!newTargetId && partiallyVisibleId) {
      newTargetId = partiallyVisibleId;
    }

    if (newTargetId && newTargetId !== selectedId) {
      debouncedUpdateState(newTargetId, selectedNodeId);
    }
  };

  createEffect(() => {
    const container = container$();
    if (!container) return;

    container.addEventListener("scroll", handleScroll);
    onCleanup(() => {
      container.removeEventListener("scroll", handleScroll);
      debouncedUpdateState.clear();
    });
  });
}
