import type { JSXElement } from "solid-js";

import { render } from "@solidjs/testing-library";
import { createEffect, Owner } from "solid-js";
import { getOwner } from "solid-js";
import { onMount, Suspense } from "solid-js";

export async function renderAsync<T extends object>(
  Component: (props: { children: JSXElement }) => JSXElement,
  resolver: (resolve: (value: T) => void) => void
) {
  let resolve: (value: T) => void;
  let promise = new Promise<T>((r) => (resolve = r));

  const result = render(() => (
    <Suspense>
      <Component>
        {(() => {
          createEffect(() => {
            resolver(resolve);
          });

          return null;
        })()}
      </Component>
    </Suspense>
  ));

  const value = await promise;

  return { ...value, ...result! };
}

/*
render(
  (props: { children: JSXElement }) => (
    <ServiceProvider>
      <Hoge />
      {props.children}
    </ServiceProvider>
  ),
  (resolve: (value: T) => void) => {
    const collections = useRxDBService().collections$()
    if (!collections) return;

    resolve(collections)
  },
)

 */
