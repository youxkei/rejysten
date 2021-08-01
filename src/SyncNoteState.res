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

  let makeItemMap = (itemMap, currentDocumentId) => {
    itemMap->Map.String.keep((_, item: State.item) => {
      item.documentId == currentDocumentId
    })
  }
)

module DocumentPane = {
  @react.component
  let make = () => {
    let dispatch = Redux.useDispatch()
    let documentMap = Redux.useSelector(State.Firestore.documentMap)
    let rootDocumentId = Redux.useSelector(State.Note.DocumentPane.rootDocumentId)

    React.useEffect(() => {
      let rootDocumentId = if rootDocumentId == "" {
        findRootDocumentId(documentMap)
      } else {
        Some(rootDocumentId)
      }

      switch rootDocumentId {
      | Some(rootDocumentId) =>
        dispatch(Action.SetNoteDocumentPaneState({map: documentMap, rootId: rootDocumentId}))

      | None => ()
      }

      None
    })

    React.null
  }
}

module ItemPane = {
  @react.component
  let make = () => {
    let dispatch = Redux.useDispatch()
    let itemMap = Redux.useSelector(State.Firestore.itemMap)
    let currentDocumentId = Redux.useSelector(State.Note.DocumentPane.currentDocumentId)
    let (currentDocumentId, ()) = Hook.useDebounce(currentDocumentId, 50)

    React.useEffect2(() => {
      dispatch(Action.SetNoteItemPaneState({map: makeItemMap(itemMap, currentDocumentId)}))

      None
    }, (itemMap, currentDocumentId))

    React.null
  }
}

@react.component
let make = () => <> <DocumentPane /> <ItemPane /> </>
