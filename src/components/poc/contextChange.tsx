import type { JSXElement } from "solid-js";

import { createEffect, createContext, createSignal, useContext } from "solid-js";

const context = createContext<number>();

function Provider(props: { x: number; children: JSXElement }) {
  return (
    <context.Provider
      value={(() => {
        console.log("calc x");
        return props.x;
      })()}
    >
      {props.children}
    </context.Provider>
  );
}

function Inner() {
  console.log("inside provider component function");
  const x$ = () => useContext(context);
  const [y$, setY] = createSignal(0);

  createEffect(() => {
    console.log("x:", x$(), "y:", y$());
  });

  return (
    <>
      <p>{x$()}</p>
      <button onClick={() => setY((y) => y + 1)}>log</button>
    </>
  );
}

export function ContextChange() {
  const [x$, setX] = createSignal(0);

  return (
    <>
      <Provider x={x$()}>
        <Inner />
      </Provider>
      <button onClick={() => setX((x) => x + 1)}>inc</button>
    </>
  );
}
