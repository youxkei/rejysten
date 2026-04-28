import { createSignal, createEffect, createResource, createComputed, onCleanup, startTransition } from "solid-js";

export function createSubscribeWithResource<Source, Value, InitialValue>(
  source$: () => Source | undefined,
  subscriber: (source: Source, setValue: (value: Value) => void) => void,
  initialValue: InitialValue,
) {
  type ResourceValue<T> = { value: T; version: number; sourceVersion: number };

  let setResource: ((value: ResourceValue<Value | InitialValue>) => void) | undefined;
  let mutateResource: ((value: ResourceValue<Value | InitialValue>) => void) | undefined;
  let activeVersion = 0;
  let emittedVersion = 0;

  const [signal$, setSignal] = createSignal<InitialValue | Value>(initialValue);
  const [ready$, setReady] = createSignal(false);

  const [resource$, { mutate }] = createResource<ResourceValue<Value | InitialValue>, Source>(
    source$,
    (source) => {
      const sourceVersion = ++activeVersion;
      setReady(false);
      let firstValue: ResourceValue<Value | InitialValue> | undefined;

      subscriber(source, (value) => {
        if (sourceVersion !== activeVersion) return;

        const resourceValue = { value, version: ++emittedVersion, sourceVersion };

        if (!firstValue) {
          firstValue = resourceValue;
        }

        if (setResource) {
          setResource(resourceValue);
          setResource = undefined;

          return;
        }

        mutateResource?.(resourceValue);
      });

      // Resolve any still-pending fetcher Promise with initialValue on cleanup.
      // Otherwise, when an owner is disposed mid-subscribe (e.g. a test times
      // out before onSnapshot delivers), the Promise stays pending forever and
      // SolidJS's Suspense/transition scheduler blocks subsequent startTransition
      // commits (cascade flaky tests).
      onCleanup(() => {
        activeVersion++;
        if (setResource) {
          setResource({ value: initialValue, version: 0, sourceVersion: 0 });
          setResource = undefined;
        }
      });

      if (firstValue) {
        return firstValue;
      } else {
        return new Promise<ResourceValue<Value | InitialValue>>((resolve) => {
          setResource = resolve as (value: ResourceValue<Value | InitialValue>) => void;
        });
      }
    },
    {
      initialValue: { value: initialValue, version: 0, sourceVersion: 0 },
    },
  );

  mutateResource = mutate;

  // Use resource$() so source changes enter the resource pending state instead
  // of continuing to expose the previous subscription value.
  // Use startTransition for remote changes so subscription updates do not block
  // urgent UI work.
  createComputed(() => {
    const resourceValue = resource$();
    void startTransition(() => {
      setSignal(() => resourceValue.value);
    }).then(() => {
      if (resourceValue.version !== 0 && resourceValue.sourceVersion === activeVersion) {
        setReady(true);
      }
    });
  });

  return Object.assign(signal$, { ready$ });
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
