import { debounce } from "@solid-primitives/scheduled";
import { createEffect, onCleanup, type Accessor } from "solid-js";

import { useStoreService } from "@/services/store";
import { createIsMobile } from "@/solid/responsive";
import { useScrollContainer } from "@/solid/scroll";

/**
 * スクロールが端に達したら、端のLifeLogにフォーカスを移動するフック
 * キーボードナビゲーションによるプログラム的スクロールではスキップする
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

  let lastSelectedId: string | undefined;
  let lastSelectedNodeId: string | undefined;

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

    const targetId = selectedId;
    if (!targetId) return;

    // プログラム的スクロール（キーボードナビゲーション、ツリー脱出など）ではスキップする
    if (targetId !== lastSelectedId || selectedNodeId !== lastSelectedNodeId) {
      lastSelectedId = targetId;
      lastSelectedNodeId = selectedNodeId;
      return;
    }

    const ids = props.lifeLogIds$();
    if (ids.length === 0) return;

    const isMobile = isMobile$();

    // スクロールが端に達した場合、端のLifeLogにフォーカスを移動する
    const isAtTop = container.scrollTop <= 1;
    const isAtBottom = container.scrollTop + container.clientHeight >= container.scrollHeight - 1;

    if (isAtTop || isAtBottom) {
      let edgeId: string;
      if (isAtTop) {
        edgeId = isMobile ? ids[ids.length - 1] : ids[0];
      } else {
        edgeId = isMobile ? ids[0] : ids[ids.length - 1];
      }

      if (edgeId !== targetId) {
        debouncedUpdateState(edgeId, selectedNodeId);
      }
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
