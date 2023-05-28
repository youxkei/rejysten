export function createDouble<Event>(timeoutMs: number, callback: (event: Event, isDouble: boolean) => unknown) {
  let timer: number | undefined = undefined;

  return (event: Event) => {
    if (timer) {
      window.clearTimeout(timer);
      timer = undefined;

      callback(event, true);
    } else {
      callback(event, false);

      timer = window.setTimeout(() => {
        timer = undefined;
      }, timeoutMs);
    }
  };
}
