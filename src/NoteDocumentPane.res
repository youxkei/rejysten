open Belt

module SetInitialSelectedDocumentId = {
  let getInitialSelectedDocumentId = rootDocument => {
    rootDocument->Option.map((rootDocument: State.noteDocument) => rootDocument.firstChildId)
  }

  @react.component
  let make = () => {
    let dispatch = Redux.useDispatch()
    let rootDocument = Redux.useSelector(State.Firestore.rootDocument)
    let isInitial = Redux.useSelector(State.Note.DocumentPane.isInitial)

    React.useEffect(() => {
      if isInitial {
        switch rootDocument->getInitialSelectedDocumentId {
        | Some(initialSelectedDocumentId) =>
          dispatch(
            Action.SetNoteDocumentPaneState({
              selectedId: initialSelectedDocumentId,
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
      <section className> <NoteDocuments document /> </section> <SetInitialSelectedDocumentId />
    </>

  | None => React.null
  }
}
