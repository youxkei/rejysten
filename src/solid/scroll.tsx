import { createContext, useContext, type Accessor, type ParentProps } from "solid-js";

export const DEFAULT_SCROLL_OFFSET_PX = 100;

const ScrollContainerContext = createContext<Accessor<HTMLElement | undefined>>();

/**
 * スクロールコンテナの参照を取得するフック
 * @returns コンテナ要素へのアクセサ
 */
export function useScrollContainer(): Accessor<HTMLElement | undefined> {
  return useContext(ScrollContainerContext) ?? (() => undefined);
}

/**
 * 要素がコンテナ内で可視かどうかをチェック（scrolloffを考慮）
 * @param container スクロールコンテナ
 * @param element チェック対象の要素
 * @param offsetPx 上下のマージン（scrolloff）
 * @returns 'visible' | 'above' | 'below'
 */
export function isElementVisible(
  container: HTMLElement,
  element: HTMLElement,
  offsetPx: number = DEFAULT_SCROLL_OFFSET_PX,
): "visible" | "above" | "below" {
  const containerRect = container.getBoundingClientRect();
  const elementRect = element.getBoundingClientRect();

  const visibleTop = containerRect.top + offsetPx;
  const visibleBottom = containerRect.bottom - offsetPx;

  if (elementRect.bottom < visibleTop) return "above";
  if (elementRect.top > visibleBottom) return "below";
  return "visible";
}

/**
 * 要素がコンテナ内で完全に可視かどうかをチェック（scrolloffを考慮）
 * isElementVisibleとは異なり、要素全体がマージン内に収まっている場合のみtrueを返す
 * @param container スクロールコンテナ
 * @param element チェック対象の要素
 * @param offsetPx 上下のマージン（scrolloff）
 * @returns 要素が完全に可視かどうか
 */
export function isElementFullyVisible(
  container: HTMLElement,
  element: HTMLElement,
  offsetPx: number = DEFAULT_SCROLL_OFFSET_PX,
): boolean {
  const containerRect = container.getBoundingClientRect();
  const elementRect = element.getBoundingClientRect();

  const visibleTop = containerRect.top + offsetPx;
  const visibleBottom = containerRect.bottom - offsetPx;

  return elementRect.top >= visibleTop && elementRect.bottom <= visibleBottom;
}

/**
 * スクロールコンテナ内で要素が見えるようにスクロール（scrolloff機能付き）
 * コンテナはScrollContainerContextから自動取得
 * @param element スクロール対象の要素
 * @param offsetPx 上下のマージン（scrolloff）
 */
export function scrollWithOffset(element: HTMLElement, offsetPx: number = DEFAULT_SCROLL_OFFSET_PX): void {
  const container = useScrollContainer()();
  if (!container) return;

  const containerRect = container.getBoundingClientRect();
  const elementRect = element.getBoundingClientRect();

  const visibleTop = containerRect.top + offsetPx;
  const visibleBottom = containerRect.bottom - offsetPx;

  if (elementRect.top < visibleTop) {
    container.scrollTop -= visibleTop - elementRect.top;
  } else if (elementRect.bottom > visibleBottom) {
    container.scrollTop += elementRect.bottom - visibleBottom;
  }
}

/**
 * スクロールコンテナコンポーネント
 * 子要素にScrollContainerContextを提供
 */
export function ScrollContainer(props: ParentProps & { class?: string }) {
  let containerRef: HTMLDivElement | undefined;

  return (
    <ScrollContainerContext.Provider value={() => containerRef}>
      <div ref={containerRef} class={props.class}>
        {props.children}
      </div>
    </ScrollContainerContext.Provider>
  );
}
