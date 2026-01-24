const pendingCallbacks: Promise<void>[] = [];

export async function awaitPendingCallbacks() {
  await Promise.all(pendingCallbacks);
  pendingCallbacks.length = 0;
  await new Promise((resolve) => setTimeout(resolve, 1));
}

export function awaitable<Args extends unknown[]>(callback: (...args: Args) => Promise<void>): (...args: Args) => void {
  return (...args: Args) => {
    const currentPending = [...pendingCallbacks];

    let promise: Promise<void>;
    if (currentPending.length > 0) {
      // Wait for pending callbacks before executing
      promise = Promise.all(currentPending)
        .then(() => callback(...args))
        .catch((e: unknown) => {
          console.error("Error in awaitable callback:", e);
        });
    } else {
      // No pending callbacks - execute directly (synchronously starts the callback)
      promise = callback(...args).catch((e: unknown) => {
        console.error("Error in awaitable callback:", e);
      });
    }

    pendingCallbacks.push(promise);
    void promise.finally(() => {
      const index = pendingCallbacks.indexOf(promise);
      if (index !== -1) void pendingCallbacks.splice(index, 1);
    });
  };
}
