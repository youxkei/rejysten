import type { JSXElement } from "solid-js";

import { render } from "@solidjs/testing-library";
import { createEffect, Suspense } from "solid-js";

export async function renderAsync<T extends object>(
  Component: (props: { children: JSXElement }) => JSXElement,
  resolver: (resolve: (value: T) => void) => void
) {
  let resolve: (value: T) => void;
  const promise = new Promise<T>((r) => (resolve = r));

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

  return { ...value, ...result };
}
