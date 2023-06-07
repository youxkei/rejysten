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