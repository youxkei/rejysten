import { createComputed, createEffect, createMemo, createSignal } from "solid-js";
import { type Meta, type StoryObj } from "storybook-solidjs";

export default {
  title: "poc/memo",
} satisfies Meta;

export const MemoTest: StoryObj = {
  render: () => {
    const [signal$, setSignal] = createSignal(0);

    const memoized$ = createMemo(signal$, 0, {
      equals: (prev, next) => {
        console.log("equals", prev, next);
        return Math.abs(prev - next) <= 1;
      },
    });

    const calculatedFromMemoized$ = () => {
      const value = memoized$() * 2;
      console.log("calculatedFromMemoized$", value);

      return value;
    };

    createComputed(() => {
      console.log("computed signal$:", signal$());
    });

    createEffect(() => {
      console.log("effect signal$:", signal$());
    });

    createComputed(() => {
      console.log("computed memoized$:", memoized$());
    });

    createEffect(() => {
      console.log("effect memoized$:", memoized$());
    });

    return (
      <>
        <div>signal: {signal$()}</div>
        <div>memoized: {memoized$()}</div>
        <div>calculatedFromMemoized: {calculatedFromMemoized$()}</div>
        <div>
          <button onClick={() => setSignal((x) => x + 1)}>+1</button>
        </div>
      </>
    );
  },
};

export const TwoMemosTest: StoryObj = {
  render: () => {
    const [signal1$, setSignal1] = createSignal(0);
    const memoized1$ = createMemo(signal1$, 0, {
      equals: (prev, next) => {
        return Math.abs(prev - next) <= 1;
      },
    });

    const [signal2$, setSignal2] = createSignal(0);
    const memoized2$ = createMemo(signal2$, 0, {
      equals: (prev, next) => {
        return Math.abs(prev - next) <= 2;
      },
    });

    const calculatedFromMemoized$ = () => {
      const value = memoized1$() * memoized2$();
      console.log("calculatedFromMemoized$", value);

      return value;
    };

    return (
      <>
        <div>signal1: {signal1$()}</div>
        <div>memoized1: {memoized1$()}</div>
        <div>signal2: {signal2$()}</div>
        <div>memoized2: {memoized2$()}</div>
        <div>calculatedFromMemoized: {calculatedFromMemoized$()}</div>
        <div>
          <button
            onClick={() => {
              setSignal1((x) => x + 1);
              setSignal2((x) => x + 1);
            }}
          >
            +1
          </button>
        </div>
      </>
    );
  },
};

export const ChainedMemoTest: StoryObj = {
  render: () => {
    const [signal$, setSignal] = createSignal(0);

    const memoized1$ = createMemo(signal$, 0, {
      equals: (prev, next) => Math.abs(prev - next) <= 1,
    });

    const memoized2$ = createMemo(memoized1$, 0, {
      equals: (prev, next) => Math.abs(prev - next) <= 2,
    });

    const calculatedFromMemoized$ = () => {
      const value = memoized2$() * 2;
      console.log("calculatedFromMemoized$", value);

      return value;
    };

    return (
      <>
        <div>signal: {signal$()}</div>
        <div>memoized1: {memoized1$()}</div>
        <div>memoized2: {memoized2$()}</div>
        <div>calculatedFromMemoized: {calculatedFromMemoized$()}</div>
        <div>
          <button onClick={() => setSignal((x) => x + 1)}>+1</button>
        </div>
      </>
    );
  },
};
