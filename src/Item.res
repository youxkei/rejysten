%%private(
  let preventDefault = ReactEvent.Synthetic.preventDefault
  let button = ReactEvent.Mouse.button
)

@react.component
let make = React.memo((~item: State.item) => {
  let currentDocumentItemId = Redux.useSelector(State.currentDocumentItemId)
  let focus = Redux.useSelector(State.focus)
  let dispatch = Redux.useDispatch()

  let handleMouseDown = event => {
    let button = event->button

    if button == 0 {
      dispatch(Action.ToInsertMode({initialCursorPosition: State.End, itemId: Some(item.id)}))
      event->preventDefault
    }
  }

  let className = if item.id == currentDocumentItemId {
    switch focus {
    | State.DocumentItems => Style.currentFocused

    | _ => Style.currentUnfocused
    }
  } else {
    ""
  }

  <span className onMouseDown=handleMouseDown> {item.text->React.string} </span>
})

React.setDisplayName(make, "Item")
