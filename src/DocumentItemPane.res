@react.component
let make = React.memo(() => {
  let focus = Redux.useSelector(State.focus)
  let rootItem = Redux.useSelector(State.DocumentItemPane.rootItem)

  let className = switch focus {
  | State.DocumentItemPane => `${Style.documentItemPane} ${Style.focusedPane}`

  | _ => `${Style.documentItemPane} ${Style.unfocusedPane}`
  }

  switch rootItem {
  | Some(item) => <section className> <Items item /> </section>

  | None => React.null
  }
})

React.setDisplayName(make, "DocumentItemPane")
