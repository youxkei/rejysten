import { cleanup, render } from "@solidjs/testing-library";
import { afterEach, describe, expect, it, vi } from "vitest";

import { WithShare } from "@/components/share";
import { StoreServiceProvider, useStoreService } from "@/services/store";

vi.mock("@/components/share/share", async () => {
  return {
    handleShare: vi.fn().mockResolvedValue(null),
    Share: () => <div>mock-share</div>,
  };
});

afterEach(() => {
  cleanup();
  history.replaceState(null, "", "/");
});

describe("WithShare", () => {
  it("renders children and keeps share inactive when URL has no share params", () => {
    history.replaceState(null, "", "/");

    let storeRef!: ReturnType<typeof useStoreService>;

    const result = render(() => (
      <StoreServiceProvider localStorageNamePostfix="withShare-no-params">
        {(() => {
          storeRef = useStoreService();
          return (
            <WithShare>
              <div>child-content</div>
            </WithShare>
          );
        })()}
      </StoreServiceProvider>
    ));

    expect(result.queryByText("child-content")).not.toBeNull();
    expect(result.queryByText("mock-share")).toBeNull();
    expect(storeRef.state.share.isActive).toBe(false);
  });

  it("activates share and renders Share when title param is present", () => {
    history.replaceState(null, "", "/?title=Example&url=https://example.com");

    let storeRef!: ReturnType<typeof useStoreService>;

    const result = render(() => (
      <StoreServiceProvider localStorageNamePostfix="withShare-title-param">
        {(() => {
          storeRef = useStoreService();
          return (
            <WithShare>
              <div>child-content</div>
            </WithShare>
          );
        })()}
      </StoreServiceProvider>
    ));

    expect(storeRef.state.share.isActive).toBe(true);
    expect(result.queryByText("mock-share")).not.toBeNull();
    expect(result.queryByText("child-content")).toBeNull();
  });

  it("activates share when only text param is present", () => {
    history.replaceState(null, "", "/?text=hello");

    let storeRef!: ReturnType<typeof useStoreService>;

    const result = render(() => (
      <StoreServiceProvider localStorageNamePostfix="withShare-text-param">
        {(() => {
          storeRef = useStoreService();
          return (
            <WithShare>
              <div>child-content</div>
            </WithShare>
          );
        })()}
      </StoreServiceProvider>
    ));

    expect(storeRef.state.share.isActive).toBe(true);
    expect(result.queryByText("mock-share")).not.toBeNull();
  });
});
