@react.component
let make = React.memo(() => {
  let rootDocument = Redux.useSelector(State.DocumentPane.rootDocument)

  switch rootDocument {
  | Some(document) => <section className=Style.documentPane> <Documents document /> </section>

  | None => React.null
  }
})

React.setDisplayName(make, "DocumentPane")
