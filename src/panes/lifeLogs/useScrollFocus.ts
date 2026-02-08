import { debounce } from "@solid-primitives/scheduled";
import { createComputed, createEffect, on, onCleanup, untrack, type Accessor } from "solid-js";

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
      // ツリーフォーカス中はPCでは下端、モバイルでは上端をスキップ
      if (selectedNodeId !== "") {
        if (isMobile ? isAtTop : isAtBottom) return;
      }

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

  // lifeLogs一覧が変わった際（レンジ再センタリングで上にアイテムが追加/削除されるなど）、
  // 選択中のlifeLogのビューポート内での位置を保持するためスクロール補正する
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
