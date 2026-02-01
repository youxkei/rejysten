import { cleanup, renderHook, waitFor } from "@solidjs/testing-library";
import { afterEach, describe, expect, it } from "vitest";
import { page } from "vitest/browser";

import { createIsMobile } from "@/solid/responsive";
import { MOBILE_BREAKPOINT } from "@/styles.css";

afterEach(() => {
  cleanup();
});

describe("createIsMobile", () => {
  it("returns false for desktop viewport (> MOBILE_BREAKPOINT)", async () => {
    await page.viewport(MOBILE_BREAKPOINT + 100, 800);

    const { result } = renderHook(() => createIsMobile());

    expect(result()).toBe(false);
  });

  it("returns true for mobile viewport (= MOBILE_BREAKPOINT)", async () => {
    await page.viewport(MOBILE_BREAKPOINT, 800);

    const { result } = renderHook(() => createIsMobile());

    expect(result()).toBe(true);
  });

  it("returns true for mobile viewport (< MOBILE_BREAKPOINT)", async () => {
    await page.viewport(414, 896);

    const { result } = renderHook(() => createIsMobile());

    expect(result()).toBe(true);
  });

  it("updates reactively when viewport changes from desktop to mobile", async () => {
    await page.viewport(1200, 800);

    const { result } = renderHook(() => createIsMobile());

    expect(result()).toBe(false);

    // Resize to mobile
    await page.viewport(414, 896);

    await waitFor(() => {
      expect(result()).toBe(true);
    });
  });

  it("updates reactively when viewport changes from mobile to desktop", async () => {
    await page.viewport(414, 896);

    const { result } = renderHook(() => createIsMobile());

    expect(result()).toBe(true);

    // Resize to desktop
    await page.viewport(1200, 800);

    await waitFor(() => {
      expect(result()).toBe(false);
    });
  });
});
