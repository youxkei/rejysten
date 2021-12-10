@react.component
let make = () => {
  let focus = Redux.useSelector(Selector.focus)
  let rootDocument = Redux.useSelector(Selector.Firestore.rootDocument)

  let className = switch focus {
  | State.Note(State.DocumentPane()) => `${Style.Note.documentPane} ${Style.Note.focusedPane}`

  | _ => `${Style.Note.documentPane} ${Style.Note.unfocusedPane}`
  }

  switch rootDocument {
  | Some(document) => <> <section className> <NoteDocuments document /> </section> </>

  | None => React.null
  }
}
