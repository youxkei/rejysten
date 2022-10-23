import { render, Suspense, ErrorBoundary } from "solid-js/web";

import { Provider } from "@/rxdb";
import { Todo } from "@/components/poc/todo";
import { Broken } from "@/components/poc/broken";
import { Lazy } from "@/components/poc/lazy";

function App() {
  return (
    <>
      <Suspense>
        <ErrorBoundary
          fallback={(err, reset) => (
            <>
              <p>Something went wrong.</p>
              <pre>{`${err}`}</pre>
              <button onClick={reset}>reset</button>
            </>
          )}
        >
          <Provider>
            <Todo />
            <Broken />
            <Lazy />
          </Provider>
        </ErrorBoundary>
      </Suspense>
    </>
  );
}

const root = document.getElementById("root");
if (root) {
  render(() => <App />, root);
}
