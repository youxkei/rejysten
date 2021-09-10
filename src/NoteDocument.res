@react.component
let make = React.memo((~document: State.document) => {
  let dispatch = Redux.useDispatch()

  let onClick = Hook.useDouble(React.useCallback1((event, isDouble) => {
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

  <div onClick> {`${document.text}　`->React.string} </div>
})
