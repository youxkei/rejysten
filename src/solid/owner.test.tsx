import { cleanup, renderHook } from "@solidjs/testing-library";
import { createContext, createMemo, createSignal, type ParentProps, useContext } from "solid-js";
import { afterEach, describe, expect, it } from "vitest";

import { withOwner } from "@/solid/owner";

afterEach(() => {
  cleanup();
});

describe("withOwner", () => {
  it("runs the callback with the owner's context available", () => {
    const Context = createContext("default");

    const { result: callback } = renderHook(() => withOwner(() => useContext(Context)), {
      wrapper: (props: ParentProps) => <Context.Provider value="provided">{props.children}</Context.Provider>,
    });

    expect(callback()).toBe("provided");
  });

  it("passes the arguments and returns the callback's return value", () => {
    const { result: callback } = renderHook(() => withOwner((a: number, b: number) => a + b));

    expect(callback(1, 2)).toBe(3);
  });

  it("disposes computations created by the callback once it returns", () => {
    let runs = 0;
    const { result } = renderHook(() => {
      const [count$, setCount] = createSignal(0);
      // Reading a JSX prop such as `isSelected={a() && b()}` in a handler creates a memo like this one
      const callback = withOwner(() =>
        createMemo(() => {
          runs++;
          return count$();
        })(),
      );
      return { callback, setCount };
    });

    result.callback();
    result.callback();
    result.callback();
    expect(runs).toBe(3);

    result.setCount(1);
    expect(runs).toBe(3);
  });
});
