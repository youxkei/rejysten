import { render, Suspense } from "solid-js/web";

import { Provider as RxdbProvider } from "@/rxdb";
import { ErrorBoundary } from "@/components/errorBoundary";

import { ShowItemList } from "@/components/poc/showItemList";
import { Broken } from "@/components/poc/broken";
import { Lazy } from "@/components/poc/lazy";
import { Context } from "@/components/poc/context";

import { RxdbSync } from "@/components/rxdbSync";

function App() {
  return (
    <ErrorBoundary>
      <Suspense fallback={<p>loading</p>}>
        <RxdbProvider>
          <ShowItemList />
          <Broken />
          <Lazy />
          <RxdbSync />
          <Context />
        </RxdbProvider>
      </Suspense>
    </ErrorBoundary>
  );
}

const root = document.getElementById("root");
if (root) {
  render(() => <App />, root);
}
