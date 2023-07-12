import type { JSXElement } from "solid-js";

import { render } from "@solidjs/testing-library";
import { onMount, Suspense } from "solid-js";

import { getPromiseWithResolve } from "@/test";

export async function renderAsync<T extends object>(
  Component: (props: { children: JSXElement }) => JSXElement,
  resolver: (resolve: (value: T) => void) => void
) {
  const { promise, resolve } = getPromiseWithResolve<T>();

  const result = render(() => (
    <Suspense>
      <Component>
        {(() => {
          onMount(() => {
            resolver(resolve);
          });

          return null;
        })()}
      </Component>
    </Suspense>
  ));

  const value = await promise;

  return { ...value, ...result };
}
