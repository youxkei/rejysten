@react.component
let make = React.memo(() => {
  let focus = Redux.useSelector(State.focus)
  let rootDocument = Redux.useSelector(State.Note.DocumentPane.rootDocument)

  let className = switch focus {
  | State.Note(State.DocumentPane()) => `${Style.Note.DocumentPane.s} ${Style.focusedPane}`

  | _ => `${Style.Note.DocumentPane.s} ${Style.unfocusedPane}`
  }

  switch rootDocument {
  | Some(document) => <section className> <NoteDocuments document /> </section>

  | None => React.null
  }
})

React.setDisplayName(make, "DocumentPane")
