import type { JSX } from "solid-js";

import { ErrorBoundary as SolidErrorBoundary } from "solid-js";

export function ErrorBoundary(props: { children: JSX.Element }) {
  return (
    <SolidErrorBoundary
      fallback={(err, reset) => (
        <>
          <p>Something went wrong.</p>
          <pre>{`${err}`}</pre>
          <pre>{err.stack}</pre>
          <button onClick={reset}>reset</button>
        </>
      )}
    >
      {props.children}
    </SolidErrorBoundary>
  );
}
