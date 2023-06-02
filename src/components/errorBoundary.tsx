import type { JSX } from "solid-js";

import { ErrorBoundary as SolidErrorBoundary } from "solid-js";

async function resetDB() {
  for (const db of await window.indexedDB.databases()) {
    window.indexedDB.deleteDatabase(db.name!);
  }
}

export function ErrorBoundary(props: { children: JSX.Element }) {
  return (
    <SolidErrorBoundary
      fallback={(err: { stack: string }, reset) => (
        <>
          <p>Something went wrong.</p>
          <pre>{err.stack}</pre>
          <button onClick={reset}>reset</button>
          <button onClick={resetDB}>reset DB</button>
        </>
      )}
    >
      {props.children}
    </SolidErrorBoundary>
  );
}
