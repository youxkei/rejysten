import { createSignal, onCleanup, type Accessor } from "solid-js";

export const MOBILE_BREAKPOINT = 768;

export function createIsMobile(): Accessor<boolean> {
  const mediaQuery = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT}px)`);
  const [isMobile, setIsMobile] = createSignal(mediaQuery.matches);

  const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches);
  mediaQuery.addEventListener("change", handler);
  onCleanup(() => {
    mediaQuery.removeEventListener("change", handler);
  });

  return isMobile;
}
