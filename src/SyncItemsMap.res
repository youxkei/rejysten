open Belt

@module("react-firebase-hooks/firestore") external useCollectionData: 'any = "useCollectionData"

%%private(
  let makeItemsMap = items => {
    let itemsMap = HashMap.String.make(~hintSize=10)

    items->Array.forEach(item => {
      let id = item["id"]

      let item = State.Item({
        id: id,
        text: item["text"],
        nextId: item["nextId"],
        prevId: item["prevId"],
        parentId: item["parentId"],
        firstSubitemId: item["firstSubitemId"],
        lastSubitemId: item["lastSubitemId"],
      })

      itemsMap->HashMap.String.set(id, item)
    })

    itemsMap
  }
)

@react.component
let make = () => {
  open Firebase.Firestore

  let dispatch = Redux.useDispatch()
  let currentDocumentId = Redux.useSelector(State.currentDocumentId)

  let (items, loading, error) = useCollectionData(
    Firebase.firestore()->collection("items")->where("documentId", "==", currentDocumentId),
    {"idField": "id"},
  )

  React.useEffect(() => {
    switch error {
    | None if !loading => dispatch(Action.SetItemsMap(makeItemsMap(items)))
    | _ => ()
    }

    None
  })

  React.null
}
