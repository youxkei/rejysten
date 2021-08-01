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

  let getInitialCurrentDocumentId = (documentMap, rootDocumentId) => {
    documentMap
    ->Map.String.get(rootDocumentId)
    ->Option.map((rootDocument: State.document) => rootDocument.firstChildId)
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
    let isInitial = Redux.useSelector(State.Note.DocumentPane.isInitial)

    React.useEffect(() => {
      if isInitial {
        let rootDocumentId = findRootDocumentId(documentMap)

        switch rootDocumentId {
        | Some(rootDocumentId) =>
          switch documentMap->getInitialCurrentDocumentId(rootDocumentId) {
          | Some(initialCurrentDocumentId) =>
            dispatch(
              Action.SetNoteDocumentPaneState({
                map: documentMap,
                currentId: Some(initialCurrentDocumentId),
                rootId: Some(rootDocumentId),
              }),
            )

          | None => ()
          }

        | None => ()
        }
      } else {
        dispatch(Action.SetNoteDocumentPaneState({map: documentMap, currentId: None, rootId: None}))
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
