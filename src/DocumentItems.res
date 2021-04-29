@react.component
let make = React.memo(() => {
  let currentRootDocumentItem = Redux.useSelector(State.Document.currentRootDocumentItem)

  switch currentRootDocumentItem {
  | Some(item) => <section className=Style.document> <Items item /> </section>

  | None => React.null
  }
})

React.setDisplayName(make, "DocumentItems")
