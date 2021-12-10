@react.component
let make = React.memo((~document: State.noteDocument) => {
  let dispatch = Redux.useDispatch()

  let onClick = Hook.useDouble(React.useCallback1((event, isDouble) => {
      dispatch(
        Action.Event(
          Event.Click({
            event: Event.Mouse(event),
            isDouble: isDouble,
            target: Event.Note(Event.DocumentPane({documentId: document.id})),
          }),
        ),
      )
    }, [document.id]))

  <p className=Style.Note.document onClick> {document.text->React.string} </p>
})
