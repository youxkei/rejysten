@react.component
let make = React.memo(() => {
  let rootItem = Redux.useSelector(State.DocumentItemPane.rootItem)

  switch rootItem {
  | Some(item) => <section className=Style.documentItemPane> <Items item /> </section>

  | None => React.null
  }
})

React.setDisplayName(make, "DocumentItemPane")
