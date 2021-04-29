open Belt

@module("react-firebase-hooks/firestore") external useCollectionData: 'any = "useCollectionData"

%%private(
  let makeItemMap = items => {
    let itemMap = HashMap.String.make(~hintSize=10)

    items->Array.forEach(item => {
      let id = item["id"]

      let item: State.documentItem = {
        id: id,
        text: item["text"],
        nextId: item["nextId"],
        prevId: item["prevId"],
        parentId: item["parentId"],
        firstChildId: item["firstChildId"],
        lastChildId: item["lastChildId"],
      }

      itemMap->HashMap.String.set(id, item)
    })

    itemMap
  }
)

@react.component
let make = React.memo(() => {
  open Firebase.Firestore

  let dispatch = Redux.useDispatch()
  let currentDocumentId = Redux.useSelector(State.DocumentPane.currentId)

  let (items, loading, error) = useCollectionData(
    Firebase.firestore()->collection("items")->where("documentId", "==", currentDocumentId),
    {"idField": "id"},
  )

  React.useEffect(() => {
    switch error {
    | None if !loading => dispatch(Action.SetDocumentItemPaneState({map: makeItemMap(items)}))

    | _ => ()
    }

    None
  })

  React.null
})

React.setDisplayName(make, "SyncDocumentItemState")
