@react.component
let make = React.memo((~document: State.document) => {
  let dispatch = Redux.useDispatch()

  let onClick = React.useCallback1(_ => {
    dispatch(Action.FocusDocumentPane())
    dispatch(
      Action.DocumentPane(
        Action.SetCurrentDocument({id: document.id, initialCursorPosition: State.End}),
      ),
    )
  }, [document.id])

  let onDoubleClick = React.useCallback1(_ => {
    dispatch(Action.FocusDocumentPane())
    dispatch(
      Action.DocumentPane(
        Action.SetCurrentDocument({id: document.id, initialCursorPosition: State.End}),
      ),
    )
    dispatch(Action.DocumentPane(Action.ToInsertMode({initialCursorPosition: State.End})))
  }, [document.id])

  <span onClick onDoubleClick> {document.text->React.string} </span>
})
