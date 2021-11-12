open Belt

module SetInitialCurrentDocumentId = {
  let getInitialCurrentDocumentId = rootDocument => {
    rootDocument->Option.map((rootDocument: State.noteDocument) => rootDocument.firstChildId)
  }

  @react.component
  let make = () => {
    let dispatch = Redux.useDispatch()
    let rootDocument = Redux.useSelector(State.Firestore.rootDocument)
    let isInitial = Redux.useSelector(State.Note.DocumentPane.isInitial)

    React.useEffect(() => {
      if isInitial {
        switch rootDocument->getInitialCurrentDocumentId {
        | Some(initialCurrentDocumentId) =>
          dispatch(
            Action.SetNoteDocumentPaneState({
              currentId: initialCurrentDocumentId,
            }),
          )

        | None => ()
        }
      }

      None
    })

    React.null
  }
}

@react.component
let make = () => {
  let focus = Redux.useSelector(State.focus)
  let rootDocument = Redux.useSelector(State.Firestore.rootDocument)

  let className = switch focus {
  | State.Note(State.DocumentPane()) => `${Style.Note.documentPane} ${Style.Note.focusedPane}`

  | _ => `${Style.Note.documentPane} ${Style.Note.unfocusedPane}`
  }

  switch rootDocument {
  | Some(document) => <>
      <section className> <NoteDocuments document /> </section> <SetInitialCurrentDocumentId />
    </>

  | None => React.null
  }
}
