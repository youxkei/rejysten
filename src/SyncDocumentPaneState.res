open Belt

@module("react-firebase-hooks/firestore") external useCollectionData: 'any = "useCollectionData"

%%private(
  let findRootDocumentId = documentMap => {
    documentMap
    ->Map.String.findFirstBy((_, document: State.document) => {
      document.parentId == ""
    })
    ->Option.map(((rootDocumentId, _)) => rootDocumentId)
  }
)

@react.component
let make = React.memo(() => {
  let dispatch = Redux.useDispatch()
  let documentMap = Redux.useSelector(State.Firestore.documentMap)

  React.useEffect(() => {
    let rootDocumentId = findRootDocumentId(documentMap)
    switch rootDocumentId {
    | Some(rootDocumentId) =>
      dispatch(Action.SetDocumentPaneState({map: documentMap, rootId: rootDocumentId}))

    | None => ()
    }

    None
  })

  React.null
})

React.setDisplayName(make, "SyncDocumentPaneState")
