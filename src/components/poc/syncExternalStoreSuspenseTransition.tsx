import { Suspense, useSyncExternalStore, startTransition } from "react";

let externalCount = 0;
let notifyExternalCountChanged: (() => void) | undefined;

function subscribe(onStorageChange: () => void) {
  notifyExternalCountChanged = onStorageChange;

  return () => {
    notifyExternalCountChanged = undefined;
  };
}

function getSnapshot() {
  return externalCount;
}

export function SyncExternalStoreSuspenseTransition() {
  const count = useSyncExternalStore(subscribe, getSnapshot);

  return (
    <>
      <Suspense fallback={<p>Loading...</p>}>
        <Count count={count} />
      </Suspense>
      <button
        onClick={() => {
          startTransition(() => {
            externalCount = count + 1;
            notifyExternalCountChanged?.();
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
