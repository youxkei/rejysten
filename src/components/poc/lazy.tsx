import { Show, createSignal, createResource, startTransition } from "solid-js";

function LazyComponent() {
  const [message] = createResource(async () => {
    await new Promise((r) => setTimeout(r, 5000));
    return "Loaded";
  });

  return <p>{message()}</p>;
}

export function Lazy() {
  const [load, setLoad] = createSignal(false);

  return (
    <>
      <p>
        <button onClick={() => startTransition(() => setLoad(!load()))}>
          {load() ? "unload" : "load"}
        </button>
      </p>
      <Show when={load()}>
        <LazyComponent />
      </Show>
    </>
  );
}
