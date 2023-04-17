import { MultiProvider } from "@solid-primitives/context";
import { render, Suspense } from "solid-js/web";

import { ErrorBoundary } from "@/components/errorBoundary";
import { Broken } from "@/components/poc/broken";
import { Context } from "@/components/poc/context";
import { Lazy } from "@/components/poc/lazy";
import { ShowItemList } from "@/components/poc/showItemList";
import { Todo } from "@/components/poc/todo";
import { RxdbFirestoreSyncConfig } from "@/components/rxdbFirestoreSyncConfig";
import { RxDBServiceProvider } from "@/services/rxdb";
import { RxDBSyncFirestoreServiceProvider } from "@/services/rxdbSync/firestore";

function App() {
  return (
    <ErrorBoundary>
      <Suspense fallback={<p>loading</p>}>
        <MultiProvider values={[RxDBServiceProvider, RxDBSyncFirestoreServiceProvider]}>
          <Todo />
          <ShowItemList />
          <Broken />
          <Lazy />
          <RxdbFirestoreSyncConfig />
          <Context />
        </MultiProvider>
      </Suspense>
    </ErrorBoundary>
  );
}

const root = document.getElementById("root");
if (root) {
  render(() => <App />, root);
}
