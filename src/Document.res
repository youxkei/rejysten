@react.component
let make = React.memo((~document: State.document) => {
  let dispatch = Redux.useDispatch()

  let onClick = Hook.useDoubleClick(React.useCallback1((event, isDouble) => {
      dispatch(
        Action.Event(
          Event.Click({
            event: Event.Mouse(event),
            isDouble: isDouble,
            target: Event.Document(document.id),
          }),
        ),
      )
    }, [document.id]))

  let onTouchEnd = Hook.useDoubleClick(React.useCallback1((event, isDouble) => {
      dispatch(
        Action.Event(
          Event.Click({
            event: Event.Touch(event),
            isDouble: isDouble,
            target: Event.Document(document.id),
          }),
        ),
      )
    }, [document.id]))

  <div onClick onTouchEnd> {`${document.text}　`->React.string} </div>
})
