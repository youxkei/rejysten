@react.component
let make = React.memo(() => {
  let focus = Redux.useSelector(State.focus)
  let rootDocument = Redux.useSelector(State.DocumentPane.rootDocument)

  let className = switch focus {
  | State.DocumentPane => `${Style.documentPane} ${Style.focusedPane}`

  | _ => `${Style.documentPane} ${Style.unfocusedPane}`
  }

  switch rootDocument {
  | Some(document) => <section className> <Documents document /> </section>

  | None => React.null
  }
})

React.setDisplayName(make, "DocumentPane")
