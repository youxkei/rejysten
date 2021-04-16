@val external window: Dom.window = "window"
@send
external addEventListener: (Dom.window, string, Dom.keyboardEvent => unit) => unit =
  "addEventListener"
@send
external removeEventListener: (Dom.window, string, Dom.keyboardEvent => unit) => unit =
  "removeEventListener"
@get external code: Dom.keyboardEvent => string = "code"
@get external shiftKey: Dom.keyboardEvent => bool = "shiftKey"
@send external preventDefault: Dom.keyboardEvent => unit = "preventDefault"

@react.component
let make = React.memo(() => {
  let dispatch = Redux.useDispatch()
  let mode = Redux.useSelector(State.mode)

  React.useEffect1(() => {
    switch mode {
    | State.Normal => {
        let listener = event => {
          let key = event->code
          let shiftKey = event->shiftKey

          switch key {
          | "KeyH" => {
              dispatch(Action.MoveCursorLeft())
              event->preventDefault
            }

          | "KeyJ" => {
              dispatch(Action.MoveCursorDown())
              event->preventDefault
            }

          | "KeyK" => {
              dispatch(Action.MoveCursorUp())
              event->preventDefault
            }

          | "KeyL" => {
              dispatch(Action.MoveCursorRight())
              event->preventDefault
            }

          | "KeyI" => {
              dispatch(Action.ToInsertMode({initialCursorPosition: State.Start, itemId: None}))
              event->preventDefault
            }

          | "KeyA" => {
              dispatch(Action.ToInsertMode({initialCursorPosition: State.End, itemId: None}))
              event->preventDefault
            }

          | "KeyO" => {
              let direction = if shiftKey {
                Action.Prev
              } else {
                Action.Next
              }

              dispatch(Action.FirestoreItem(Action.Add({text: None, direction: direction})))

              dispatch(Action.ToInsertMode({initialCursorPosition: State.Start, itemId: None}))
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
})

React.setDisplayName(make, "KeyDownHandler")
