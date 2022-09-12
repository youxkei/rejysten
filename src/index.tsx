import { createRoot } from "react-dom/client";
import { StrictMode, Suspense } from "react";
import { Provider } from "react-redux";

import { App } from "./app";
import { store } from "./store";

const root = document.getElementById("root");

if (root) {
  createRoot(root).render(
    <Provider store={store}>
      <StrictMode>
        <Suspense>
          <App />
        </Suspense>
      </StrictMode>
    </Provider>
  );
}
