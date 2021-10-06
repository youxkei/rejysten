open Belt

let getInitialCurrentDocumentId = (documentMap, rootDocumentId) => {
  documentMap
  ->Map.String.get(rootDocumentId)
  ->Option.map((rootDocument: State.noteDocument) => rootDocument.firstChildId)
}

module DocumentPaneSync = {
  @react.component
  let make = () => {
    let dispatch = Redux.useDispatch()
    let documentMap = Redux.useSelector(State.Firestore.documentMap)
    let rootDocumentId = Redux.useSelector(State.Firestore.rootDocumentId)
    let isInitial = Redux.useSelector(State.Note.DocumentPane.isInitial)

    React.useEffect(() => {
      if isInitial && rootDocumentId != "" {
        switch documentMap->getInitialCurrentDocumentId(rootDocumentId) {
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
let make = () => <>
  <main className=Style.Note.s> <NoteDocumentPane /> <NoteItemPane /> </main> <DocumentPaneSync />
</>
