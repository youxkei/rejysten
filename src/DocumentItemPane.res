@react.component
let make = React.memo(() => {
  let currentRootDocumentItem = Redux.useSelector(State.DocumentPane.currentRootDocumentItem)

  switch currentRootDocumentItem {
  | Some(item) => <section className=Style.documentItemPane> <Items item /> </section>

  | None => React.null
  }
})

React.setDisplayName(make, "DocumentItemPane")
