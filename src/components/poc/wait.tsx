import { createResource, createSignal, Suspense } from "solid-js";

export function Wait() {
  const [reloadTrigger$, reload] = createSignal(0);
  const [value] = createResource(
    reloadTrigger$,
    () => new Promise<number>((resolve) => setTimeout(() => resolve(42), 1000)),
  );

  function onClick() {
    //startTransition(() => {
    reload(Date.now());
    //});
  }

  return (
    <Suspense fallback={"waiting"}>
      <p>Wait PoC</p>
      <p>{value()}</p>
      <button onClick={onClick}>Click</button>
    </Suspense>
  );
}
