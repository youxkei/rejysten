import { render, Suspense } from "solid-js/web";

import { Provider as RxdbProvider } from "@/rxdb";
import { Sync as RxdbFirestoreSync } from "@/rxdb/sync/firestore";
import { ErrorBoundary } from "@/components/errorBoundary";

import { ShowItemList } from "@/components/poc/showItemList";
import { Broken } from "@/components/poc/broken";
import { Lazy } from "@/components/poc/lazy";
import { Context } from "@/components/poc/context";

import { RxdbFirestoreSyncConfig } from "./components/rxdbFirestoreSyncConfig";
import { Todo } from "./components/poc/todo";

function App() {
  return (
    <ErrorBoundary>
      <Suspense fallback={<p>loading</p>}>
        <RxdbProvider>
          <RxdbFirestoreSync />
          <Todo />
          <ShowItemList />
          <Broken />
          <Lazy />
          <RxdbFirestoreSyncConfig />
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
