const shortener = /^styles_styles_(.+)__\w{8}$/;

export function shortenClassName(root: HTMLElement) {
  for (const element of Array.from(root.querySelectorAll("[class]"))) {
    for (const className of Array.from(element.classList)) {
      const match = className.match(shortener);
      if (match) {
        element.classList.replace(className, match[1]);
      }
    }
  }

  return root;
}

export function getPromiseWithResolve<T = void>() {
  // eslint-disable-next-line @typescript-eslint/no-empty-function
  let resolve = (_: T) => {};
  const promise = new Promise<T>((res) => {
    resolve = res;
  });

  return { promise, resolve };
}

export function randomPosInt() {
  return Math.floor(Math.random() * 1024) + 1;
}
