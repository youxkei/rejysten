import { createRoot, createSignal } from "solid-js";
import { describe, it, expect } from "vitest";

import { createSubscribeWithResource } from "@/solid/subscribe";

describe("createSubscribeWithResource", () => {
  it("should update value when data arrives synchronously", async () => {
    const result = await new Promise<string>((resolve) => {
      createRoot((dispose) => {
        const [source$] = createSignal<string | undefined>("initial");

        const signal$ = createSubscribeWithResource<string, string, string>(
          source$,
          (source, setValue) => {
            // Immediate callback - data arrives instantly
            setValue(`data for ${source}`);
          },
          "initial value",
        );

        // Wait for reactive updates to propagate
        setTimeout(() => {
          const value = signal$();
          resolve(value);
          dispose();
        }, 10);
      });
    });
    expect(result).toBe("data for initial");
  });

  it("should update value when data arrives asynchronously", async () => {
    const result = await new Promise<string>((resolve) => {
      createRoot((dispose) => {
        const [source$] = createSignal<string | undefined>("initial");

        let setValue: ((value: string) => void) | undefined;

        const signal$ = createSubscribeWithResource<string, string, string>(
          source$,
          (_source, sv) => {
            // Store setValue to call later (simulating delayed data)
            setValue = sv;
          },
          "initial value",
        );

        // Initially should be initial value
        expect(signal$()).toBe("initial value");

        // Deliver data asynchronously
        setTimeout(() => {
          setValue?.(`delayed data`);

          // Give time for value to propagate
          setTimeout(() => {
            const value = signal$();
            resolve(value);
            dispose();
          }, 10);
        }, 10);
      });
    });
    expect(result).toBe("delayed data");
  });

  it("should update value when source$ changes and data arrives asynchronously", async () => {
    // This test verifies that when source$ changes, late-arriving data is still delivered
    // via mutateResource (which uses a version check to filter stale updates)
    const result = await new Promise<{ firstValue: string; secondValue: string }>((resolve) => {
      createRoot((dispose) => {
        const [source$, setSource] = createSignal<string | undefined>("first");

        let setValue: ((value: string) => void) | undefined;

        const signal$ = createSubscribeWithResource<string, string, string>(
          source$,
          (_source, sv) => {
            // Store setValue to call later (simulating delayed data)
            setValue = sv;
          },
          "initial value",
        );

        // Wait for initial setup
        setTimeout(() => {
          // Deliver first data
          setValue?.(`data for first`);

          setTimeout(() => {
            const afterFirstData = signal$();

            // Change source$ - this increments the version counter
            setSource("second");

            // Deliver second data asynchronously
            setTimeout(() => {
              // At this point:
              // - Version has incremented (old subscriber's updates are ignored)
              // - Data arrives now and should be delivered via mutateResource
              setValue?.(`data for second`);

              // Give time for value to propagate
              setTimeout(() => {
                const secondValue = signal$();
                resolve({ firstValue: afterFirstData, secondValue });
                dispose();
              }, 50);
            }, 50);
          }, 10);
        }, 10);
      });
    });

    // First value should work
    expect(result.firstValue).toBe("data for first");

    // Second value should also be delivered correctly
    expect(result.secondValue).toBe("data for second");
  });

  it("should ignore updates from stale subscribers after source$ changes", async () => {
    // This test verifies that old subscriber callbacks are ignored after source$ changes
    const result = await new Promise<{ values: string[]; staleUpdateIgnored: boolean }>((resolve) => {
      createRoot((dispose) => {
        const [source$, setSource] = createSignal<string | undefined>("first");

        const setValueCallbacks: ((value: string) => void)[] = [];
        const values: string[] = [];

        const signal$ = createSubscribeWithResource<string, string, string>(
          source$,
          (_source, sv) => {
            // Store each setValue callback
            setValueCallbacks.push(sv);
          },
          "initial value",
        );

        // Wait for initial setup
        setTimeout(() => {
          // setValueCallbacks[0] is from "first" source
          setValueCallbacks[0]?.(`data from first`);

          setTimeout(() => {
            values.push(signal$());

            // Change source$ to "second"
            setSource("second");

            setTimeout(() => {
              // setValueCallbacks[1] is from "second" source
              // setValueCallbacks[0] is stale (from "first" source)

              // Try to send data from stale subscriber - should be ignored
              setValueCallbacks[0]?.(`stale data from first`);

              setTimeout(() => {
                const valueAfterStale = signal$();
                // Stale update should be ignored - value should not be "stale data from first"
                const staleUpdateIgnored = valueAfterStale !== "stale data from first";

                // Send data from current subscriber - should work
                setValueCallbacks[1]?.(`data from second`);

                setTimeout(() => {
                  values.push(signal$());
                  resolve({ values, staleUpdateIgnored });
                  dispose();
                }, 10);
              }, 10);
            }, 10);
          }, 10);
        }, 10);
      });
    });

    expect(result.values).toEqual([
      "data from first", // First value works
      "data from second", // Current subscriber's update works
    ]);
    // Most importantly: stale update was ignored
    expect(result.staleUpdateIgnored).toBe(true);
  });

  it("should keep previous value when source$ becomes undefined", async () => {
    // createResource doesn't call fetcher when source is undefined,
    // so the signal keeps its previous value
    const result = await new Promise<{ valueWithSource: string; valueWithoutSource: string }>((resolve) => {
      createRoot((dispose) => {
        const [source$, setSource] = createSignal<string | undefined>("initial");

        const signal$ = createSubscribeWithResource<string, string, string>(
          source$,
          (source, setValue) => {
            setValue(`data for ${source}`);
          },
          "initial value",
        );

        // Wait for initial data
        setTimeout(() => {
          const valueWithSource = signal$();

          // Change source$ to undefined
          setSource(undefined);

          // Wait for reactive updates
          setTimeout(() => {
            const valueWithoutSource = signal$();
            resolve({ valueWithSource, valueWithoutSource });
            dispose();
          }, 50);
        }, 10);
      });
    });

    expect(result.valueWithSource).toBe("data for initial");
    // Previous value is kept since fetcher is not called when source is undefined
    expect(result.valueWithoutSource).toBe("data for initial");
  });
});
