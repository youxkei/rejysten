import { Suspense, startTransition } from "react";

import { useSelector, useDispatch } from "@/store";
import { app } from "@/slices/app";

export function ReduxSuspenseTransition() {
  const count = useSelector((state) => state.app.count);
  const dispatch = useDispatch();

  return (
    <>
      <Suspense fallback={<p>Loading...</p>}>
        <Count count={count} />
      </Suspense>
      <button
        onClick={() => {
          startTransition(() => {
            dispatch(app.actions.increment());
          });
        }}
      >
        increment
      </button>
    </>
  );
}

const alreadySleptMap = new Map<number, boolean>();
function Count({ count }: { count: number }) {
  if (alreadySleptMap.get(count)) {
    return <p>{count}</p>;
  }

  throw (async () => {
    await new Promise((resolve) => setTimeout(resolve, 1000));
    alreadySleptMap.set(count, true);
  })();
}
