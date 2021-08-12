open Belt

@module("react-firebase-hooks/firestore") external useCollectionData: 'any = "useCollectionData"

%%private(
  let getInitialCurrentDocumentId = (documentMap, rootDocumentId) => {
    documentMap
    ->Map.String.get(rootDocumentId)
    ->Option.map((rootDocument: State.document) => rootDocument.firstChildId)
  }
)

module DocumentPane = {
  @react.component
  let make = () => {
    let dispatch = Redux.useDispatch()
    let documentMap = Redux.useSelector(State.Firestore.documentMap)
    let rootDocumentId = Redux.useSelector(State.Firestore.rootDocumentId)
    let isInitial = Redux.useSelector(State.Note.DocumentPane.isInitial)

    React.useEffect(() => {
      if isInitial {
        if rootDocumentId != "" {
          switch documentMap->getInitialCurrentDocumentId(rootDocumentId) {
          | Some(initialCurrentDocumentId) =>
            dispatch(
              Action.SetNoteDocumentPaneState({
                currentId: Some(initialCurrentDocumentId),
              }),
            )

          | None => ()
          }
        } else {
          ()
        }
      } else {
        dispatch(Action.SetNoteDocumentPaneState({currentId: None}))
      }

      None
    })

    React.null
  }
}

module ItemPane = {
  @react.component
  let make = () => {
    React.useEffect(() => {
      None
    })

    React.null
  }
}

@react.component
let make = () => <> <DocumentPane /> <ItemPane /> </>
