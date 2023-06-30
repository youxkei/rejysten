import { MultiProvider } from "@solid-primitives/context";
import { render, Suspense } from "solid-js/web";

import { ErrorBoundary } from "@/components/errorBoundary";
import { Main } from "@/components/main";
import { EventServiceProvider } from "@/services/event";
import { EventEmitterServiceProvider } from "@/services/eventEmitter";
import { EventHandlerServiceProvider } from "@/services/eventHandler";
import { LockServiceProvider } from "@/services/lock";
import { RxDBServiceProvider } from "@/services/rxdb";
import { RxDBSyncFirestoreServiceProvider } from "@/services/rxdbSync/firestore";
import { StoreServiceProvider } from "@/services/store";

function App() {
  return (
    <ErrorBoundary>
      <Suspense fallback={<p>loading</p>}>
        <MultiProvider
          values={[
            RxDBServiceProvider,
            RxDBSyncFirestoreServiceProvider,
            StoreServiceProvider,
            LockServiceProvider,
            EventServiceProvider,
            EventHandlerServiceProvider,
            EventEmitterServiceProvider,
          ]}
        >
          <Main />
        </MultiProvider>
      </Suspense>
    </ErrorBoundary>
  );
}

const root = document.getElementById("root");
if (root) {
  render(() => <App />, root);
}
