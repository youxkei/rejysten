import type { JSX } from "solid-js";

import { Suspense, Show, createSignal, createResource, onCleanup, createContext, useContext } from "solid-js";

const context = createContext<() => string | undefined>();

function Provider(props: { children: JSX.Element }) {
  const [data] = createResource(async () => {
    await new Promise((resolve) => setTimeout(resolve, 3000));

    return "OK";
  });

  const newData = () => {
    const d = data();

    if (d) {
      onCleanup(() => {
        console.log("signal cleanup with", d);
      });
    }

    return d;
  };

  onCleanup(() => {
    const d = data();

    console.log("provider cleanup with", d);
  });

  return <context.Provider value={newData}>{props.children}</context.Provider>;
}

function Component() {
  const data = useContext(context)!;

  return <p>{data()}</p>;
}

export function Context() {
  const [show, setShow] = createSignal(true);

  return (
    <>
      <p>Context</p>
      <Suspense fallback={<p>loading</p>}>
        <Show when={show()}>
          <Provider>
            <Component />
          </Provider>
        </Show>
      </Suspense>
      <p>
        <button onClick={() => setShow(!show())}>{show() ? "hide" : "show"}</button>
      </p>
    </>
  );
}
