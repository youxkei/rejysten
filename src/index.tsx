import { render, Suspense } from "solid-js/web";

import { Todo } from "@/components/poc/todo";

function App() {
  return (
    <>
      <Suspense>
        <p>In Suspense</p>
        <Todo />
      </Suspense>
    </>
  );
}

const root = document.getElementById("root");
if (root) {
  render(() => <App />, root);
}
