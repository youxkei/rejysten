open Belt

@module("firebase/app") external firebase: 'any = "default"
@module("react-firebase-hooks/firestore") external useCollectionData: 'any = "useCollectionData"

%%private(
  let makeItemsMap = items => {
    let itemsMap = HashMap.String.make(~hintSize=10)
    let rootItem = ref(None)

    items->Array.forEach(item => {
      let id = item["id"]
      let text = item["text"]
      let next = item["next"]
      let prev = item["prev"]
      let parent = item["parent"]
      let firstSubitem = item["firstSubitem"]
      let lastSubitem = item["lastSubitem"]
      let item = Item.Item({
        id: id,
        text: text,
        next: next,
        prev: prev,
        parent: parent,
        firstSubitem: firstSubitem,
        lastSubitem: lastSubitem,
      })

      itemsMap->HashMap.String.set(id, item)

      if parent == "" {
        rootItem.contents = Some(item)
      }
    })

    (itemsMap, Option.getExn(rootItem.contents))
  }
)

@react.component
let make = React.memo((~document) => {
  open Firebase.Firestore

  let (items, loading, error) = useCollectionData(
    Firebase.firestore()->collection("items")->where("document", "==", document),
    {"idField": "id"},
  )

  Js.log("useCollectionData")

  switch error {
  | Some(error) => <span> {error["toString"]()->React.string} </span>
  | None =>
    if loading {
      <span> loading </span>
    } else {
      let (itemsMap, item) = makeItemsMap(items)

      <Items document itemsMap item />
    }
  }
})
