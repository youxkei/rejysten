open Belt

@module("react-firebase-hooks/firestore") external useCollectionData: 'any = "useCollectionData"

%%private(
  let makeDocumentMap = documents => {
    let documentMap = HashMap.String.make(~hintSize=10)
    let rootDocumentId = ref("")

    documents->Array.forEach((document: State.document) => {
      documentMap->HashMap.String.set(document.id, document)

      if document.parentId == "" {
        rootDocumentId := document.id
      }
    })

    (documentMap, rootDocumentId.contents)
  }
)

@react.component
let make = React.memo(() => {
  let dispatch = Redux.useDispatch()
  let documents = Redux.useSelector(State.Firestore.documents)

  React.useEffect(() => {
    let (documentMap, rootDocumentId) = makeDocumentMap(documents)
    dispatch(Action.SetDocumentPaneState({map: documentMap, rootId: rootDocumentId}))

    None
  })

  React.null
})

React.setDisplayName(make, "SyncDocumentPaneState")
