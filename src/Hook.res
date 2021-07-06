@val @scope("window")
external addEventListener: (string, Dom.keyboardEvent => unit) => unit = "addEventListener"
@val @scope("window")
external removeEventListener: (string, Dom.keyboardEvent => unit) => unit = "removeEventListener"
@val external setTimeout: (unit => unit, int) => float = "setTimeout"
@val external clearTimeout: float => unit = "clearTimeout"

@module("use-debounce") @val external useDebounce: ('a, int) => ('a, unit) = "useDebounce"

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

let useTouch = callback => {
  let noTouchMoveRef = React.useRef(true)

  let onTouchMove = React.useCallback(_ => {
    noTouchMoveRef.current = false
  })

  let onTouchCancel = React.useCallback(_ => {
    noTouchMoveRef.current = true
  })

  let onTouchEnd = React.useCallback1(event => {
    if noTouchMoveRef.current {
      callback(event)
    }

    noTouchMoveRef.current = true
  }, [callback])

  (onTouchMove, onTouchEnd, onTouchCancel)
}
