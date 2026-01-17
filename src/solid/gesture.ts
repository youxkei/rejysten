import { createEffect, onCleanup, type Accessor } from "solid-js";

export interface SwipeHandlers {
  onSwipeLeft?: () => void;
  onSwipeRight?: () => void;
}

const DEFAULT_THRESHOLD = 50;

export function createSwipeHandler(
  element: Accessor<HTMLElement | undefined>,
  handlers: SwipeHandlers,
  threshold = DEFAULT_THRESHOLD,
): void {
  let startX = 0;
  let startY = 0;

  function onTouchStart(e: TouchEvent) {
    startX = e.touches[0].clientX;
    startY = e.touches[0].clientY;
  }

  function onTouchEnd(e: TouchEvent) {
    const endX = e.changedTouches[0].clientX;
    const endY = e.changedTouches[0].clientY;
    const deltaX = endX - startX;
    const deltaY = endY - startY;

    // Only trigger if horizontal movement exceeds vertical
    if (Math.abs(deltaX) > Math.abs(deltaY) && Math.abs(deltaX) > threshold) {
      if (deltaX > 0) {
        handlers.onSwipeRight?.();
      } else {
        handlers.onSwipeLeft?.();
      }
    }
  }

  createEffect(() => {
    const el = element();
    if (!el) return;

    el.addEventListener("touchstart", onTouchStart, { passive: true });
    el.addEventListener("touchend", onTouchEnd, { passive: true });

    onCleanup(() => {
      el.removeEventListener("touchstart", onTouchStart);
      el.removeEventListener("touchend", onTouchEnd);
    });
  });
}
