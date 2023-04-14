import { render, Suspense } from "solid-js/web";

import { Todo } from "./components/poc/todo";
import { RxdbFirestoreSyncConfig } from "./components/rxdbFirestoreSyncConfig";
import { ErrorBoundary } from "@/components/errorBoundary";
import { Broken } from "@/components/poc/broken";
import { Context } from "@/components/poc/context";
import { Lazy } from "@/components/poc/lazy";
import { ShowItemList } from "@/components/poc/showItemList";
import { Provider as RxdbProvider } from "@/rxdb";
import { Sync as RxdbFirestoreSync } from "@/rxdb/sync/firestore";

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
