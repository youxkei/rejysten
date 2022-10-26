import { render, Suspense } from "solid-js/web";

import { Provider as RxdbProvider } from "@/rxdb";
import { ErrorBoundary } from "@/components/errorBoundary";
import { Todo } from "@/components/poc/todo";
import { Broken } from "@/components/poc/broken";
import { Lazy } from "@/components/poc/lazy";
import { RxdbSync } from "@/components/rxdbSync";

function App() {
  return (
    <>
      <ErrorBoundary>
        <Suspense>
          <RxdbProvider>
            <Todo />
            <Broken />
            <Lazy />
            <RxdbSync />
          </RxdbProvider>
        </Suspense>
      </ErrorBoundary>
    </>
  );
}

const root = document.getElementById("root");
if (root) {
  render(() => <App />, root);
}
