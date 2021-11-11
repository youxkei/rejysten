@val @scope("window")
external addEventListener: (string, Dom.keyboardEvent => unit) => unit = "addEventListener"
@val @scope("window")
external removeEventListener: (string, Dom.keyboardEvent => unit) => unit = "removeEventListener"
@val external setTimeout: (unit => unit, int) => float = "setTimeout"
@val external clearTimeout: float => unit = "clearTimeout"
@val @scope("window") external innerHeight: int = "innerHeight"

@module("use-debounce") @val external useDebounce: ('a, int) => ('a, unit) = "useDebounce"

let useDouble = callback => {
  let timerRef = React.useRef(None)

  React.useCallback1(event => {
    switch timerRef.current {
    | Some(timer) =>
      clearTimeout(timer)
      timerRef.current = None

      callback(event, true)

    | None =>
      callback(event, false)

      timerRef.current = Some(setTimeout(() => {timerRef.current = None}, 300))
    }
  }, [callback])
}

let useInnerHeight = () => {
  let (currentInnerHeight, setCurrentInnerHeight) = React.useState(() => innerHeight)

  React.useEffect1(() => {
    let onResize = _ => {
      setCurrentInnerHeight(_ => innerHeight)
    }

    addEventListener("resize", onResize)

    Some(
      () => {
        removeEventListener("resize", onResize)
      },
    )
  }, [])

  currentInnerHeight
}
