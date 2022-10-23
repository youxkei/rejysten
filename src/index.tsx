import { render, Suspense } from "solid-js/web";

import { Provider } from "@/rxdb";
import { ErrorBoundary } from "@/components/errorBoundary";
import { Todo } from "@/components/poc/todo";
import { Broken } from "@/components/poc/broken";
import { Lazy } from "@/components/poc/lazy";

function App() {
  return (
    <>
      <ErrorBoundary>
        <Suspense>
          <Provider>
            <Todo />
            <Broken />
            <Lazy />
          </Provider>
        </Suspense>
      </ErrorBoundary>
    </>
  );
}

const root = document.getElementById("root");
if (root) {
  render(() => <App />, root);
}
