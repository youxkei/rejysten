import { createSignal, Show } from "solid-js";

export function ShowRedraw() {
  const [count$, setCount] = createSignal(0);

  return (
    <>
      <Show when={count$()} fallback={<p>loading</p>}>
        {(c$) => {
          console.log("draw");

          return <p>{c$()}</p>;
        }}
      </Show>
      <button onClick={() => setCount((count) => count + 1)}>inc</button>
    </>
  );
}
