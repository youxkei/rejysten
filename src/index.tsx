import { createRoot } from "react-dom/client";
import { StrictMode, Suspense } from "react";

import { App } from "./app";
import { Provider } from "./store";

const root = document.getElementById("root");

if (root) {
  createRoot(root).render(
    <Provider>
      <StrictMode>
        <Suspense>
          <App />
        </Suspense>
      </StrictMode>
    </Provider>
  );
}
