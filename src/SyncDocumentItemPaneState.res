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

  React.useEffect(() => {
    dispatch(Action.SetDocumentItemPaneState({map: makeItemMap(itemMap, currentDocumentId)}))

    None
  })

  React.null
})

React.setDisplayName(make, "SyncDocumentItemPaneState")
