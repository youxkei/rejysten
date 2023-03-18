import { createSignal, createEffect, createResource } from "solid-js";

export function createSubscribeResource<Source, Value, InitialValue>(
  source$: () => Source | undefined,
  subscriber: (source: Source, setValue: (value: Value) => void) => void,
  initialValue: InitialValue
) {
  let setResource: ((value: Value) => void) | undefined;
  let mutateResource: ((value: Value) => void) | undefined;

  const [resource, { mutate }] = createResource<
    Value | InitialValue,
    Source,
    unknown
  >(
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
        return new Promise<Value | InitialValue>((resolve) => {
          setResource = resolve as (value: Value) => void;
        });
      }
    },
    {
      initialValue,
    }
  );

  mutateResource = mutate;

  return resource;
}

export function createSubscribeSignal<Value, InitialValue>(
  subscriber: (setValue: (value: Value) => void) => void,
  initialValue: InitialValue
) {
  const [signal, setSignal] = createSignal<Value | InitialValue>(initialValue);

  createEffect(() => {
    subscriber((value) => {
      setSignal(() => value);
    });
  });

  return signal;
}
