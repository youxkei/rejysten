@react.component
let make = React.memo(() => {
  let focus = Redux.useSelector(State.focus)
  let rootDocument = Redux.useSelector(State.Firestore.rootDocument)

  let className = switch focus {
  | State.Note(State.DocumentPane()) => `${Style.Note.documentPane} ${Style.Note.focusedPane}`

  | _ => `${Style.Note.documentPane} ${Style.Note.unfocusedPane}`
  }

  switch rootDocument {
  | Some(document) => <section className> <NoteDocuments document /> </section>

  | None => React.null
  }
})

React.setDisplayName(make, "DocumentPane")
