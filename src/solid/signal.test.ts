import { createRoot, createSignal } from "solid-js";
import { describe, it, expect } from "vitest";

import { createLatchSignal } from "@/solid/signal";

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

describe("createLatchSignal", () => {
  it("returns initialValue before signal emits", async () => {
    const result = await new Promise<number>((resolve) => {
      createRoot((dispose) => {
        const [signal$] = createSignal(42);
        const [clock$] = createSignal(false);

        const latched$ = createLatchSignal(signal$, clock$, 0);

        // First tick: should have signal's current value (not initialValue)
        // because clock is low and signal$ returns 42
        setTimeout(() => {
          resolve(latched$());
          dispose();
        }, 10);
      });
    });
    expect(result).toBe(42);
  });

  it("passes through signal changes when clock is low", async () => {
    const result = await new Promise<number[]>((resolve) => {
      createRoot((dispose) => {
        const [signal$, setSignal] = createSignal(1);
        const [clock$] = createSignal(false);

        const latched$ = createLatchSignal(signal$, clock$, 0);
        const values: number[] = [];

        setTimeout(() => {
          values.push(latched$());

          setSignal(2);
          setTimeout(() => {
            values.push(latched$());

            setSignal(3);
            setTimeout(() => {
              values.push(latched$());
              resolve(values);
              dispose();
            }, 10);
          }, 10);
        }, 10);
      });
    });
    expect(result).toEqual([1, 2, 3]);
  });

  it("freezes output when clock goes high", async () => {
    const result = await new Promise<{ before: number; during: number }>((resolve) => {
      createRoot((dispose) => {
        const [signal$, setSignal] = createSignal(1);
        const [clock$, setClock] = createSignal(false);

        const latched$ = createLatchSignal(signal$, clock$, 0);

        setTimeout(() => {
          const before = latched$();

          setClock(true);
          setSignal(99);

          setTimeout(() => {
            const during = latched$();
            resolve({ before, during });
            dispose();
          }, 10);
        }, 10);
      });
    });
    expect(result.before).toBe(1);
    expect(result.during).toBe(1);
  });

  it("emits latest value when clock goes from high to low", async () => {
    const result = await new Promise<{ frozen: number; afterRelease: number }>((resolve) => {
      createRoot((dispose) => {
        const [signal$, setSignal] = createSignal(1);
        const [clock$, setClock] = createSignal(false);

        const latched$ = createLatchSignal(signal$, clock$, 0);

        setTimeout(() => {
          setClock(true);
          setSignal(42);

          setTimeout(() => {
            const frozen = latched$();

            setClock(false);

            setTimeout(() => {
              const afterRelease = latched$();
              resolve({ frozen, afterRelease });
              dispose();
            }, 10);
          }, 10);
        }, 10);
      });
    });
    expect(result.frozen).toBe(1);
    expect(result.afterRelease).toBe(42);
  });

  it("handles multiple signal changes during high clock", async () => {
    const result = await new Promise<{ frozen: number; afterRelease: number }>((resolve) => {
      createRoot((dispose) => {
        const [signal$, setSignal] = createSignal(1);
        const [clock$, setClock] = createSignal(false);

        const latched$ = createLatchSignal(signal$, clock$, 0);

        setTimeout(() => {
          setClock(true);
          setSignal(10);
          setSignal(20);
          setSignal(30);

          setTimeout(() => {
            const frozen = latched$();

            setClock(false);
            setTimeout(() => {
              const afterRelease = latched$();
              resolve({ frozen, afterRelease });
              dispose();
            }, 10);
          }, 10);
        }, 10);
      });
    });
    expect(result.frozen).toBe(1);
    expect(result.afterRelease).toBe(30);
  });

  it("handles multiple high/low cycles", async () => {
    const result = await new Promise<number[]>((resolve) => {
      void createRoot(async (dispose) => {
        const [signal$, setSignal] = createSignal(1);
        const [clock$, setClock] = createSignal(false);

        const latched$ = createLatchSignal(signal$, clock$, 0);
        const values: number[] = [];

        await wait(10);
        values.push(latched$()); // 1

        // Cycle 1: high → change → low
        setClock(true);
        setSignal(10);
        await wait(10);
        values.push(latched$()); // still 1

        setClock(false);
        await wait(10);
        values.push(latched$()); // 10

        // Cycle 2: high → change → low
        setClock(true);
        setSignal(20);
        await wait(10);
        values.push(latched$()); // still 10

        setClock(false);
        await wait(10);
        values.push(latched$()); // 20

        resolve(values);
        dispose();
      });
    });
    expect(result).toEqual([1, 1, 10, 10, 20]);
  });

  it("does not emit stale intermediate values after clock release", async () => {
    const result = await new Promise<number>((resolve) => {
      createRoot((dispose) => {
        const [signal$, setSignal] = createSignal(1);
        const [clock$, setClock] = createSignal(false);

        const latched$ = createLatchSignal(signal$, clock$, 0);

        setTimeout(() => {
          setClock(true);
          setSignal(10); // intermediate
          setSignal(20); // intermediate
          setSignal(30); // final

          setClock(false);

          setTimeout(() => {
            resolve(latched$());
            dispose();
          }, 10);
        }, 10);
      });
    });
    expect(result).toBe(30);
  });

  it("no-op when signal unchanged during high clock", async () => {
    const result = await new Promise<{ before: number; afterRelease: number }>((resolve) => {
      createRoot((dispose) => {
        const [signal$] = createSignal(42);
        const [clock$, setClock] = createSignal(false);

        const latched$ = createLatchSignal(signal$, clock$, 0);

        setTimeout(() => {
          const before = latched$();

          setClock(true);
          // no signal change
          setClock(false);

          setTimeout(() => {
            const afterRelease = latched$();
            resolve({ before, afterRelease });
            dispose();
          }, 10);
        }, 10);
      });
    });
    expect(result.before).toBe(42);
    expect(result.afterRelease).toBe(42);
  });

  it("works with object values (reference changes)", async () => {
    const result = await new Promise<{ frozen: string; afterRelease: string }>((resolve) => {
      createRoot((dispose) => {
        const [signal$, setSignal] = createSignal({ name: "old" });
        const [clock$, setClock] = createSignal(false);

        const latched$ = createLatchSignal(signal$, clock$, { name: "init" });

        setTimeout(() => {
          setClock(true);
          setSignal({ name: "new" });

          setTimeout(() => {
            const frozen = latched$().name;

            setClock(false);
            setTimeout(() => {
              const afterRelease = latched$().name;
              resolve({ frozen, afterRelease });
              dispose();
            }, 10);
          }, 10);
        }, 10);
      });
    });
    expect(result.frozen).toBe("old");
    expect(result.afterRelease).toBe("new");
  });

  it("works with array values (simulates subscription data)", async () => {
    type Item = { id: string; text: string };
    const result = await new Promise<{ frozen: Item[]; afterRelease: Item[] }>((resolve) => {
      createRoot((dispose) => {
        const [signal$, setSignal] = createSignal<Item[]>([]);
        const [clock$, setClock] = createSignal(false);

        const latched$ = createLatchSignal(signal$, clock$, [] as Item[]);

        setTimeout(() => {
          setClock(true);
          setSignal([{ id: "1", text: "hello" }]);

          setTimeout(() => {
            const frozen = latched$();

            setClock(false);
            setTimeout(() => {
              const afterRelease = latched$();
              resolve({ frozen, afterRelease });
              dispose();
            }, 10);
          }, 10);
        }, 10);
      });
    });
    expect(result.frozen).toEqual([]);
    expect(result.afterRelease).toEqual([{ id: "1", text: "hello" }]);
  });

  it("subscriber sees frozen value during high clock", async () => {
    const result = await new Promise<number[]>((resolve) => {
      createRoot((dispose) => {
        const [signal$, setSignal] = createSignal(1);
        const [clock$, setClock] = createSignal(false);

        const latched$ = createLatchSignal(signal$, clock$, 0);
        const observed: number[] = [];

        // Track all values the subscriber sees
        // Use setTimeout polling to simulate UI reads
        setTimeout(() => {
          observed.push(latched$()); // 1

          setClock(true);
          setSignal(99);
          observed.push(latched$()); // still 1 (frozen)

          setClock(false);

          setTimeout(() => {
            observed.push(latched$()); // 99

            resolve(observed);
            dispose();
          }, 10);
        }, 10);
      });
    });
    expect(result).toEqual([1, 1, 99]);
  });

  it("handles clock toggle without signal change between cycles", async () => {
    const result = await new Promise<number[]>((resolve) => {
      void createRoot(async (dispose) => {
        const [signal$, setSignal] = createSignal(1);
        const [clock$, setClock] = createSignal(false);

        const latched$ = createLatchSignal(signal$, clock$, 0);
        const values: number[] = [];

        await wait(10);
        values.push(latched$()); // 1

        // Cycle 1: change during high
        setClock(true);
        setSignal(10);
        await wait(10);
        setClock(false);
        await wait(10);
        values.push(latched$()); // 10

        // Cycle 2: NO change during high
        setClock(true);
        await wait(10);
        setClock(false);
        await wait(10);
        values.push(latched$()); // still 10

        // Cycle 3: change during high again
        setClock(true);
        setSignal(20);
        await wait(10);
        setClock(false);
        await wait(10);
        values.push(latched$()); // 20

        resolve(values);
        dispose();
      });
    });
    expect(result).toEqual([1, 10, 10, 20]);
  });

  it("handles async signal changes during high clock (simulates onSnapshot)", async () => {
    const result = await new Promise<{ frozen: number; afterRelease: number }>((resolve) => {
      createRoot((dispose) => {
        const [signal$, setSignal] = createSignal(0);
        const [clock$, setClock] = createSignal(false);

        const latched$ = createLatchSignal(signal$, clock$, -1);

        setTimeout(() => {
          // Simulate redo flow:
          // 1. Clock goes high
          setClock(true);

          // 2. Async operation (like runBatch + onSnapshot) updates signal later
          setTimeout(() => {
            setSignal(42);

            // 3. Read while still high
            const frozen = latched$();

            // 4. Clock goes low
            setClock(false);

            setTimeout(() => {
              const afterRelease = latched$();
              resolve({ frozen, afterRelease });
              dispose();
            }, 10);
          }, 20);
        }, 10);
      });
    });
    expect(result.frozen).toBe(0);
    expect(result.afterRelease).toBe(42);
  });

  it("handles component remount during high clock (the bug scenario)", async () => {
    // Simulates: ChildrenNodes unmounts during undo (high clock),
    // then remounts during redo (still high clock), and on clock-low
    // should show the new data.
    const result = await new Promise<{ afterRemount: number[] }>((resolve) => {
      void createRoot(async (dispose) => {
        const [signal$, setSignal] = createSignal<number[]>([1, 2, 3]);
        const [clock$, setClock] = createSignal(false);

        // First latch (simulates original mount)
        const latched1$ = createLatchSignal(signal$, clock$, [] as number[]);

        await wait(10);
        expect(latched1$()).toEqual([1, 2, 3]);

        // Simulate undo: clock high, signal changes to empty
        setClock(true);
        setSignal([]);

        await wait(10);
        // latched1$ should still show [1,2,3] (frozen)
        expect(latched1$()).toEqual([1, 2, 3]);

        // Simulate redo: signal changes to new data (while clock still high)
        setSignal([4, 5]);

        // Simulate component remount: create NEW latch with same signal/clock
        // This is what happens when ChildrenNodes remounts during redo
        const latched2$ = createLatchSignal(signal$, clock$, [] as number[]);

        await wait(10);
        // New latch was created during clock-high, so output is initialValue []
        expect(latched2$()).toEqual([]);

        // Clock goes low — new latch should emit the current signal value
        setClock(false);

        await wait(10);
        const afterRemount = latched2$();

        resolve({ afterRemount });
        dispose();
      });
    });
    // After clock release, remounted latch should show the latest data
    expect(result.afterRemount).toEqual([4, 5]);
  });

  it("handles rapid clock toggles", async () => {
    const result = await new Promise<number>((resolve) => {
      void createRoot(async (dispose) => {
        const [signal$, setSignal] = createSignal(0);
        const [clock$, setClock] = createSignal(false);

        const latched$ = createLatchSignal(signal$, clock$, -1);

        await wait(10);

        // Rapid toggles
        setClock(true);
        setSignal(1);
        setClock(false);
        setClock(true);
        setSignal(2);
        setClock(false);
        setClock(true);
        setSignal(3);
        setClock(false);

        await wait(10);
        resolve(latched$());
        dispose();
      });
    });
    expect(result).toBe(3);
  });

  it("clock high from the very start", async () => {
    const result = await new Promise<{ duringHigh: string; afterLow: string }>((resolve) => {
      void createRoot(async (dispose) => {
        const [signal$, setSignal] = createSignal("initial");
        const [clock$, setClock] = createSignal(true); // start high

        const latched$ = createLatchSignal(signal$, clock$, "init-value");

        await wait(10);
        const duringHigh = latched$();

        setSignal("changed");
        await wait(10);

        setClock(false);
        await wait(10);
        const afterLow = latched$();

        resolve({ duringHigh, afterLow });
        dispose();
      });
    });
    // During high from start, initialValue is used
    expect(result.duringHigh).toBe("init-value");
    expect(result.afterLow).toBe("changed");
  });
});
