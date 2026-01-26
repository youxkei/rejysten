import { createSignal, createEffect, createResource, createComputed, startTransition } from "solid-js";

export function createSubscribeWithResource<Source, Value, InitialValue>(
  source$: () => Source | undefined,
  subscriber: (source: Source, setValue: (value: Value) => void) => void,
  initialValue: InitialValue,
) {
  let setResource: ((value: Value) => void) | undefined;
  let mutateResource: ((value: Value) => void) | undefined;
  let activeVersion = 0;

  const [signal$, setSignal] = createSignal<InitialValue | Value>(initialValue);

  const [resource$, { mutate }] = createResource<Value | InitialValue, Source>(
    source$,
    (source) => {
      const version = ++activeVersion;
      let firstValue: { value: Value } | undefined;

      subscriber(source, (value) => {
        if (version !== activeVersion) return;

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
        return new Promise<Value | InitialValue>((resolve) => {
          setResource = resolve as (value: Value) => void;
        });
      }
    },
    {
      initialValue,
    },
  );

  mutateResource = mutate;

  // for remote changes
  createComputed(() => startTransition(() => setSignal(() => resource$())));

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
