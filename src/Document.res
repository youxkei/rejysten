@react.component
let make = React.memo((~document: State.document) => {
  let dispatch = Redux.useDispatch()

  let onClick = Hook.useDoubleClick(React.useCallback1((event, isDouble) => {
      dispatch(Action.FocusDocumentPane())
      dispatch(
        Action.DocumentPane(
          Action.SetCurrentDocument({id: document.id, initialCursorPosition: State.End}),
        ),
      )

      if isDouble {
        dispatch(Action.DocumentPane(Action.ToInsertMode({initialCursorPosition: State.End})))
        event->ReactEvent.Mouse.preventDefault
      } else {
        dispatch(Action.DocumentPane(Action.ToNormalMode()))
      }
    }, [document.id]))

  let onTouchEnd = Hook.useDoubleClick(React.useCallback1((event, isDouble) => {
      if event->ReactEvent.Touch.cancelable {
        dispatch(Action.FocusDocumentPane())
        dispatch(
          Action.DocumentPane(
            Action.SetCurrentDocument({id: document.id, initialCursorPosition: State.End}),
          ),
        )

        if isDouble {
          dispatch(Action.DocumentPane(Action.ToInsertMode({initialCursorPosition: State.End})))
          event->ReactEvent.Touch.preventDefault
        } else {
          dispatch(Action.DocumentPane(Action.ToNormalMode()))
        }
      }
    }, [document.id]))

  <span onClick onTouchEnd> {document.text->React.string} </span>
})
