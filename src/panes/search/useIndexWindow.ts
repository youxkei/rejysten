import { createComputed, createMemo, createSignal, on, startTransition, untrack, type Accessor } from "solid-js";

import { beginAction } from "@/telemetry/span";

export const DEFAULT_WINDOW_SIZE = 50;
export const DEFAULT_EXPAND_CHUNK = 25;

export interface UseIndexWindowOptions {
  totalCount$: Accessor<number>;
  selectedIndex$: Accessor<number>;
  resetKey$: Accessor<unknown>;
  windowSize?: number;
  expandChunk?: number;
}

/**
 * 全件のうち [windowStart, windowEnd) のインデックス範囲だけを描画するためのwindowフック。
 * スクロール端でchunk単位に拡張し、選択インデックスがwindow外に出たら追従する
 * （端の近くなら拡張、遠くへのジャンプならwindowを選択中心に置き直す）
 */
export function useIndexWindow(options: UseIndexWindowOptions) {
  const windowSize = options.windowSize ?? DEFAULT_WINDOW_SIZE;
  const expandChunk = options.expandChunk ?? DEFAULT_EXPAND_CHUNK;

  const [rawStart$, setRawStart] = createSignal(0);
  const [rawEnd$, setRawEnd] = createSignal(windowSize);
  const [isSliding$, setIsSliding] = createSignal(false);

  // クランプ済みのwindow境界。結果が減ってもここで自動修復される
  const windowStart$ = createMemo(() => {
    const total = options.totalCount$();
    if (total === 0) return 0;
    return Math.max(0, Math.min(rawStart$(), total - 1));
  });
  const windowEnd$ = createMemo(() => Math.min(rawEnd$(), options.totalCount$()));

  const canExpandUp$ = createMemo(() => windowStart$() > 0);
  const canExpandDown$ = createMemo(() => windowEnd$() < options.totalCount$());

  async function expandUp() {
    if (isSliding$() || !canExpandUp$()) return;
    setIsSliding(true);

    // Scroll-triggered, so it runs outside any user action: its own root span
    // covering the window-expansion transition (the perceivable scroll hitch).
    const handle = beginAction("scroll.expandSearchWindowUp", {
      root: true,
      attributes: { "app.expand_chunk": expandChunk },
    });
    await handle.runBody(async () => {
      await startTransition(() => {
        setRawStart(untrack(windowStart$) - expandChunk);
      });
      handle.span.setAttribute("app.window_size", untrack(windowEnd$) - untrack(windowStart$));
    });

    requestAnimationFrame(() => {
      setIsSliding(false);
    });
  }

  async function expandDown() {
    if (isSliding$() || !canExpandDown$()) return;
    setIsSliding(true);

    const handle = beginAction("scroll.expandSearchWindowDown", {
      root: true,
      attributes: { "app.expand_chunk": expandChunk },
    });
    await handle.runBody(async () => {
      await startTransition(() => {
        setRawEnd(untrack(windowEnd$) + expandChunk);
      });
      handle.span.setAttribute("app.window_size", untrack(windowEnd$) - untrack(windowStart$));
    });

    requestAnimationFrame(() => {
      setIsSliding(false);
    });
  }

  // 選択追従。pureフェーズ（createComputed）で動かすことで、描画スライスのmemoが
  // 同一フラッシュ内で先に再計算され、選択行がmountされてからscrollWithOffsetの
  // エフェクトが走る順序を保証する
  createComputed(
    on([options.selectedIndex$, options.totalCount$], ([selectedIndex, total]) => {
      if (total === 0) return;

      const sel = Math.min(Math.max(selectedIndex, 0), total - 1);
      const start = untrack(windowStart$);
      const end = untrack(windowEnd$);

      if (sel >= start && sel < end) return;

      if (sel >= start - expandChunk && sel < start) {
        setRawStart(start - expandChunk);
      } else if (sel >= end && sel < end + expandChunk) {
        setRawEnd(end + expandChunk);
      } else {
        // 遠くへのジャンプ（G/gなど）: windowを選択中心に置き直す。
        // 置き直し後のwindowは選択を中心に持つため、直後のscrollイベントが
        // 端に当たってもcanExpandUp/Downのガードで余計な拡張は起きない。
        // ここはtransition中のcomputed内なので、rAFでのisSliding解除のような
        // 副作用のスケジュールは行わない（解除が利かずスタックする）
        const newStart = Math.max(0, Math.min(sel - Math.floor(windowSize / 2), total - windowSize));
        setRawStart(newStart);
        setRawEnd(newStart + windowSize);
      }
    }),
  );

  // クエリ変更などでwindowを初期位置へ戻す
  createComputed(
    on(
      options.resetKey$,
      () => {
        setRawStart(0);
        setRawEnd(windowSize);
      },
      { defer: true },
    ),
  );

  return {
    windowStart$,
    windowEnd$,
    isSliding$,
    canExpandUp$,
    canExpandDown$,
    expandUp,
    expandDown,
  };
}
