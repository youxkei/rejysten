@val external window: Dom.window = "window"
@send
external addEventListener: (Dom.window, string, Dom.keyboardEvent => unit) => unit =
  "addEventListener"
@send
external removeEventListener: (Dom.window, string, Dom.keyboardEvent => unit) => unit =
  "removeEventListener"
@get external code: Dom.keyboardEvent => string = "code"
@get external shiftKey: Dom.keyboardEvent => bool = "shiftKey"
@get external ctrlKey: Dom.keyboardEvent => bool = "ctrlKey"
@send external preventDefault: Dom.keyboardEvent => unit = "preventDefault"

let normalModeKeyDownHandler = (dispatch, event) => {
  let code = event->code
  let ctrlKey = event->ctrlKey
  let shiftKey = event->shiftKey

  switch code {
  | "KeyH" if !ctrlKey => {
      dispatch(Action.MoveCursorLeft())
      event->preventDefault
    }

  | "KeyJ" if !ctrlKey => {
      dispatch(Action.MoveCursorDown())
      event->preventDefault
    }

  | "KeyK" if !ctrlKey => {
      dispatch(Action.MoveCursorUp())
      event->preventDefault
    }

  | "KeyL" if !ctrlKey => {
      dispatch(Action.MoveCursorRight())
      event->preventDefault
    }

  | "KeyI" if !ctrlKey => {
      dispatch(Action.ToInsertMode({initialCursorPosition: State.Start, itemId: None}))
      event->preventDefault
    }

  | "KeyA" if !ctrlKey => {
      dispatch(Action.ToInsertMode({initialCursorPosition: State.End, itemId: None}))
      event->preventDefault
    }

  | "KeyO" if !ctrlKey => {
      let direction = if shiftKey {
        Action.Prev
      } else {
        Action.Next
      }

      dispatch(Action.FirestoreItem(Action.Add({direction: direction})))

      dispatch(Action.ToInsertMode({initialCursorPosition: State.Start, itemId: None}))
      event->preventDefault
    }

  | _ => ()
  }
}

let insertModeKeyDownHandler = (dispatch, event) => {
  let code = event->code
  let ctrlKey = event->ctrlKey
  let shiftKey = event->shiftKey

  switch code {
  | "Escape" => {
      dispatch(Action.FirestoreItem(Action.Save))
      dispatch(Action.ToNormalMode())
    }

  | "Tab" if !shiftKey => {
      dispatch(Action.FirestoreItem(Action.Indent))
      event->preventDefault
    }

  | "Tab" if shiftKey => {
      dispatch(Action.FirestoreItem(Action.Unindent))
      event->preventDefault
    }

  | "Enter" if !shiftKey => {
      dispatch(Action.FirestoreItem(Action.Add({direction: Action.Next})))
      event->preventDefault
    }

  | "Backspace" => {
      dispatch(Action.FirestoreItem(Action.Delete({direction: Action.Prev})))
    }

  | "Delete" => {
      dispatch(Action.FirestoreItem(Action.Delete({direction: Action.Next})))
    }

  | _ => ()
  }
}

@react.component
let make = React.memo(() => {
  let dispatch = Redux.useDispatch()
  let mode = Redux.useSelector(State.mode)

  let normalModeKeyDownHandler = React.useMemo1(() => normalModeKeyDownHandler(dispatch), [])
  let insertModeKeyDownHandler = React.useMemo1(() => insertModeKeyDownHandler(dispatch), [])

  React.useEffect1(() => {
    let listener = switch mode {
    | State.Normal => normalModeKeyDownHandler

    | State.Insert(_) => insertModeKeyDownHandler
    }

    window->addEventListener("keydown", listener)

    Some(
      () => {
        window->removeEventListener("keydown", listener)
      },
    )
  }, [mode])

  React.null
})

React.setDisplayName(make, "KeyDownHandler")
