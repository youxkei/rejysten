@react.component
let make = React.memo((~item: State.Item.t) => {
  let currentDocumentItemId = Redux.useSelector(State.currentDocumentItemId)
  let focus = Redux.useSelector(State.focus)

  let className = if item.id == currentDocumentItemId {
    switch focus {
    | State.DocumentItems => Style.currentFocused

    | _ => Style.currentUnfocused
    }
  } else {
    ""
  }

  <span className> {item.text->React.string} </span>
})

React.setDisplayName(make, "Item")
