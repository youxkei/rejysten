@val external window: Dom.window = "window"
@send
external addEventListener: (Dom.window, string, Dom.keyboardEvent => unit) => unit =
  "addEventListener"
@send
external removeEventListener: (Dom.window, string, Dom.keyboardEvent => unit) => unit =
  "removeEventListener"
@get external code: Dom.keyboardEvent => string = "code"
@send external preventDefault: Dom.keyboardEvent => unit = "preventDefault"

@react.component
let make = () => {
  let dispatch = Redux.useDispatch()
  let mode = Redux.useSelector(State.mode)

  React.useEffect1(() => {
    switch mode {
    | State.Normal => {
        let listener = event => {
          let key = event->code

          switch key {
          | "KeyH" => {
              dispatch(Action.NormalMode(Action.MoveCursorLeft))
              event->preventDefault
            }

          | "KeyJ" => {
              dispatch(Action.NormalMode(Action.MoveCursorDown))
              event->preventDefault
            }

          | "KeyK" => {
              dispatch(Action.NormalMode(Action.MoveCursorUp))
              event->preventDefault
            }

          | "KeyL" => {
              dispatch(Action.NormalMode(Action.MoveCursorRight))
              event->preventDefault
            }

          | "KeyI" => {
              dispatch(
                Action.NormalMode(
                  Action.ToInsertMode({initialCursorPosition: State.Start, item_id: None}),
                ),
              )
              event->preventDefault
            }

          | "KeyA" => {
              dispatch(
                Action.NormalMode(
                  Action.ToInsertMode({initialCursorPosition: State.End, item_id: None}),
                ),
              )
              event->preventDefault
            }

          | _ => ()
          }
        }

        window->addEventListener("keydown", listener)

        Some(
          () => {
            window->removeEventListener("keydown", listener)
          },
        )
      }

    | _ => None
    }
  }, [mode])

  React.null
}
