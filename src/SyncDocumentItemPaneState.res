@module("react-firebase-hooks/firestore") external useCollectionData: 'any = "useCollectionData"

%%private(
  let makeItemMap = (items, currentDocumentId) => {
    let itemMap = Belt.HashMap.String.make(~hintSize=10)

    items->Belt.Array.forEach((item: State.item) => {
      if item.documentId == currentDocumentId {
        itemMap->Belt.HashMap.String.set(item.id, item)
      }
    })

    itemMap
  }
)

@react.component
let make = React.memo(() => {
  let dispatch = Redux.useDispatch()
  let items = Redux.useSelector(State.Firestore.items)
  let currentDocumentId = Redux.useSelector(State.DocumentPane.currentDocumentId)

  React.useEffect(() => {
    dispatch(Action.SetDocumentItemPaneState({map: makeItemMap(items, currentDocumentId)}))

    None
  })

  React.null
})

React.setDisplayName(make, "SyncDocumentItemPaneState")
