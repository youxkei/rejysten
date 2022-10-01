import { Suspense, useState, startTransition } from "react";

export function StateSuspenseTransition() {
  const [count, setCount] = useState(0);

  return (
    <>
      <Suspense fallback={<p>Loading...</p>}>
        <Count count={count} />
      </Suspense>
      <button
        onClick={() => {
          startTransition(() => {
            setCount(count + 1);
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
