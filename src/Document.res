@send external preventDefault: ReactEvent.Mouse.t => unit = "preventDefault"

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
      }

      event->preventDefault
    }, [document.id]))

  <span onClick> {document.text->React.string} </span>
})
