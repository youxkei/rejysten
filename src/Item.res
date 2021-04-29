@react.component
let make = React.memo((~item: State.documentItem) => {
  let currentDocumentItemId = Redux.useSelector(State.DocumentItemPane.currentId)
  let focus = Redux.useSelector(State.focus)

  let className = if item.id == currentDocumentItemId {
    switch focus {
    | State.DocumentItemPane => Style.currentFocused

    | _ => Style.currentUnfocused
    }
  } else {
    ""
  }

  <span className> {item.text->React.string} </span>
})

React.setDisplayName(make, "Item")
