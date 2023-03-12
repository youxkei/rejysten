import { createResource } from "solid-js";

export function createSubscribeResource<Source, Value, InitialValue>(
  sourceSignal: () => Source | undefined,
  subscriber: (source: Source, setValue: (value: Value) => void) => void,
  initialValue: InitialValue
) {
  let setResource: (value: Value) => void;
  let mutateResource: (value: Value) => void;

  const [resource, { mutate }] = createResource<
    Value | InitialValue,
    Source,
    unknown
  >(
    sourceSignal,
    (source) => {
      subscriber(source, (value) => {
        setResource(value);
        setResource = mutateResource;
      });

      return new Promise<Value | InitialValue>((resolve) => {
        setResource = resolve as (value: Value) => void;
      });
    },
    {
      initialValue,
    }
  );

  mutateResource = mutate;

  return resource;
}
