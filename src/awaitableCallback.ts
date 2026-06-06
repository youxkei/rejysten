import { takeActionHandoff } from "@/telemetry/span";

const pendingCallbacks: Promise<void>[] = [];

export async function awaitPendingCallbacks(options?: { timeoutMs?: number }) {
  const deadline = options?.timeoutMs === undefined ? undefined : Date.now() + options.timeoutMs;

  await new Promise((resolve) => setTimeout(resolve, 1));

  while (pendingCallbacks.length > 0) {
    const pending = [...pendingCallbacks];
    const all = Promise.allSettled(pending).then(() => undefined);

    if (deadline === undefined) {
      await all;
    } else {
      const remainingMs = deadline - Date.now();
      if (remainingMs <= 0) break;
      await Promise.race([all, new Promise<void>((resolve) => setTimeout(resolve, remainingMs))]);
    }

    await new Promise((resolve) => setTimeout(resolve, 1));
  }

  await new Promise((resolve) => setTimeout(resolve, 1));
}

export function awaitable<Args extends unknown[]>(callback: (...args: Args) => Promise<void>): (...args: Args) => void {
  return (...args: Args) => {
    // Span handle offered by the action registry wrapper in the same tick.
    // It records the action body (and any queue wait) and ends when the body
    // settles. Non-action callbacks have no handle and are not traced.
    const action = takeActionHandoff();
    const currentPending = [...pendingCallbacks];

    const run = () => (action ? action.runBody(() => callback(...args)) : callback(...args));

    let promise: Promise<void>;
    if (currentPending.length > 0) {
      // Wait for pending callbacks before executing
      const endQueueWait = action?.startQueueWait();
      promise = Promise.all(currentPending)
        .then(() => {
          endQueueWait?.();
          return run();
        })
        .catch((e: unknown) => {
          console.error(`Error in awaitable callback "${callback.name}":`, e);
        });
    } else {
      // No pending callbacks - execute directly (synchronously starts the callback)
      promise = run().catch((e: unknown) => {
        console.error(`Error in awaitable callback "${callback.name}":`, e);
      });
    }

    pendingCallbacks.push(promise);
    void promise.finally(() => {
      const index = pendingCallbacks.indexOf(promise);
      if (index !== -1) void pendingCallbacks.splice(index, 1);
    });
  };
}
