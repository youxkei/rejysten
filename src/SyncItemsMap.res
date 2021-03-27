open Belt

@module("react-firebase-hooks/firestore") external useCollectionData: 'any = "useCollectionData"

%%private(
  let makeItemsMap = items => {
    let itemsMap = HashMap.String.make(~hintSize=10)

    items->Array.forEach(item => {
      let id = item["id"]
      let text = item["text"]
      let next = item["next"]
      let prev = item["prev"]
      let parent = item["parent"]
      let firstSubitem = item["firstSubitem"]
      let lastSubitem = item["lastSubitem"]
      let item = State.Item({
        id: id,
        text: text,
        next: next,
        prev: prev,
        parent: parent,
        firstSubitem: firstSubitem,
        lastSubitem: lastSubitem,
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
  let document = Redux.useSelector(State.currentDocument)

  let (items, loading, error) = useCollectionData(
    Firebase.firestore()->collection("items")->where("document", "==", document),
    {"idField": "id"},
  )

  React.useEffect(() => {
    switch error {
    | None if !loading => dispatch(Action.SyncItemsMap(makeItemsMap(items)))
    | _ => ()
    }

    None
  })

  React.null
}
