open Belt

@module("react-firebase-hooks/firestore") external useCollectionData: 'any = "useCollectionData"

%%private(
  let makeItemMap = (itemMap, currentDocumentId) => {
    itemMap->Map.String.keep((_, item: State.item) => {
      item.documentId == currentDocumentId
    })
  }
)

@react.component
let make = React.memo(() => {
  let dispatch = Redux.useDispatch()
  let itemMap = Redux.useSelector(State.Firestore.itemMap)
  let currentDocumentId = Redux.useSelector(State.DocumentPane.currentDocumentId)
  let (currentDocumentId, ()) = Hook.useDebounce(currentDocumentId, 50)

  React.useEffect2(() => {
    dispatch(Action.SetDocumentItemPaneState({map: makeItemMap(itemMap, currentDocumentId)}))

    None
  }, (itemMap, currentDocumentId))

  React.null
})

React.setDisplayName(make, "SyncDocumentItemPaneState")
