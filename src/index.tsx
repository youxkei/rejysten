import { createRoot } from "react-dom/client";
import { StrictMode, Suspense } from "react";

import { App } from "./app";
import { Provider } from "./store";
import { ErrorBoundary } from "react-error-boundary";

const root = document.getElementById("root");

if (root) {
  createRoot(root).render(
    <Provider>
      <StrictMode>
        <ErrorBoundary
          fallbackRender={({ error, resetErrorBoundary }) => (
            <>
              <div>Something went wrong.</div>
              <pre>{`${error}`}</pre>
              <button onClick={resetErrorBoundary}>Try again</button>
            </>
          )}
        >
          <Suspense>
            <App />
          </Suspense>
        </ErrorBoundary>
      </StrictMode>
    </Provider>
  );
}
