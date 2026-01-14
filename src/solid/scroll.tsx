import { createContext, useContext, type Accessor, type ParentProps } from "solid-js";

export const DEFAULT_SCROLL_OFFSET_PX = 100;

const ScrollContainerContext = createContext<Accessor<HTMLElement | undefined>>();

/**
 * スクロールコンテナ内で要素が見えるようにスクロール（scrolloff機能付き）
 * コンテナはScrollContainerContextから自動取得
 * @param element スクロール対象の要素
 * @param offsetPx 上下のマージン（scrolloff）
 */
export function scrollWithOffset(element: HTMLElement, offsetPx: number = DEFAULT_SCROLL_OFFSET_PX): void {
  const container = useContext(ScrollContainerContext)?.();
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
