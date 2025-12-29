import { createSignal, createEffect, createResource, createComputed, startTransition, onCleanup } from "solid-js";

export function createSubscribeWithResource<Source, Value, InitialValue>(
  source$: () => Source | undefined,
  subscriber: (source: Source, setValue: (value: Value) => void) => void,
  initialValue: InitialValue,
) {
  let setResource: ((value: Value) => void) | undefined;
  let mutateResource: ((value: Value) => void) | undefined;

  const [signal$, setSignal] = createSignal<InitialValue | Value>(initialValue);

  const [resource$, { mutate }] = createResource<Value | InitialValue, Source>(
    source$,
    (source) => {
      let firstValue: { value: Value } | undefined;

      subscriber(source, (value) => {
        if (!firstValue) {
          firstValue = { value };
        }

        if (setResource) {
          setResource(value);
          setResource = undefined;

          return;
        }

        mutateResource?.(value);
      });

      if (firstValue) {
        return Promise.resolve(firstValue.value);
      } else {
        // Race between actual data and 10ms timeout
        // If data arrives within 10ms, use it; otherwise resolve with initialValue
        // and data will come later via mutate
        let timeoutId: ReturnType<typeof setTimeout> | undefined;
        onCleanup(() => {
          if (timeoutId) clearTimeout(timeoutId);
        });

        return Promise.race([
          new Promise<Value>((resolve) => {
            setResource = (value) => {
              clearTimeout(timeoutId);
              resolve(value);
            };
          }),
          new Promise<InitialValue>((resolve) => {
            timeoutId = setTimeout(() => {
              // Clear setResource so data goes through mutateResource instead
              setResource = undefined;
              resolve(initialValue);
            }, 40);
          }),
        ]);
      }
    },
    {
      initialValue,
    },
  );

  mutateResource = mutate;

  // for remote changes
  createComputed(() => startTransition(() => setSignal(resource$)));

  return signal$;
}

export function createSubscribeWithSignal<Value, InitialValue>(
  subscriber: (setValue: (value: Value) => void) => void,
  initialValue: InitialValue,
) {
  const [signal, setSignal] = createSignal<Value | InitialValue>(initialValue);

  createEffect(() => {
    subscriber((value) => {
      setSignal(() => value);
    });
  });

  return signal;
}
