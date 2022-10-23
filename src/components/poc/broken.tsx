import { Show, createSignal } from "solid-js";

function Throw() {
  throw new Error("broken component");

  return null;
}
export function Broken() {
  const [broken, setBroken] = createSignal(false);

  return (
    <>
      <Show when={broken()}>
        <Throw />
      </Show>
      <p>
        <button onClick={() => setBroken(!broken())}>break</button>
      </p>
    </>
  );
}
