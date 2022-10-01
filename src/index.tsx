import { createRoot } from "react-dom/client";
import { StrictMode, Suspense } from "react";

import { App } from "@/components/app";
import { Provider } from "@/store";
import { ErrorBoundary } from "@/errorBoundary";

const root = document.getElementById("root");

if (root) {
  createRoot(root).render(
    <StrictMode>
      <Provider>
        <Suspense>
          <ErrorBoundary>
            <App />
          </ErrorBoundary>
        </Suspense>
      </Provider>
    </StrictMode>
  );
}
