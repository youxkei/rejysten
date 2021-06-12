@val @scope("window")
external addEventListener: (string, Dom.keyboardEvent => unit) => unit = "addEventListener"
@val @scope("window")
external removeEventListener: (string, Dom.keyboardEvent => unit) => unit = "removeEventListener"
@val external setTimeout: (unit => unit, int) => float = "setTimeout"
@val external clearTimeout: float => unit = "clearTimeout"

let useKeyDown = (handler, dependencies) => {
  React.useEffect1(() => {
    addEventListener("keypress", handler)

    Some(
      () => {
        removeEventListener("keypress", handler)
      },
    )
  }, dependencies)
}

let useDoubleClick = callback => {
  let timerRef = React.useRef(Js.Nullable.null)

  React.useCallback1(event => {
    switch timerRef.current->Js.Nullable.toOption {
    | Some(timer) =>
      clearTimeout(timer)
      timerRef.current = Js.Nullable.null

      callback(event, true)

    | None =>
      callback(event, false)

      timerRef.current = Js.Nullable.return(
        setTimeout(() => {timerRef.current = Js.Nullable.null}, 300),
      )
    }
  }, [callback])
}
