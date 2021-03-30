%%private(
  let preventDefault = ReactEvent.Synthetic.preventDefault
  let button = ReactEvent.Mouse.button
)

@react.component
let make = React.memo((~item, ~isCurrent) => {
  let dispatch = Redux.useDispatch()

  let State.Item({id, text}) = item

  let handleMouseDown = event => {
    let button = event->button

    if button == 0 {
      dispatch(
        Action.NormalMode(
          Action.ToInsertMode({initialCursorPosition: State.End, item_id: Some(id)}),
        ),
      )
      event->preventDefault
    }
  }

  let style = if isCurrent {
    ReactDOM.Style.make(~backgroundColor="red", ())
  } else {
    ReactDOM.Style.make()
  }

  <span style onMouseDown=handleMouseDown> {text->React.string} </span>
})
