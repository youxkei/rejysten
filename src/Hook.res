@val @scope("window") external addEventListener: (string, Dom.keyboardEvent => ()) => () = "addEventListener"
@val @scope("window") external removeEventListener: (string, Dom.keyboardEvent => ()) => () = "removeEventListener"

let useKeyDown = (handler, dependencies) => {
  React.useEffect1(() => {
    addEventListener("keypress", handler);

    Some(() => {
      removeEventListener("keypress", handler);
    });
  }, dependencies);
}
