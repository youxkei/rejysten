@module("react-firebase-hooks/firestore") external useCollectionData: 'any = "useCollectionData"

%%private(
  let searchItems = (items, searchingText) => {
    let items = items->Js.Array2.filter(item => {
      item["text"]->Js.String2.includes(searchingText)
    })

    items->Js.Array2.map(item => {
      let item: State.item = {
        id: item["id"],
        text: item["text"],
        nextId: item["nextId"],
        prevId: item["prevId"],
        parentId: item["parentId"],
        firstChildId: item["firstChildId"],
        lastChildId: item["lastChildId"],
      }

      item
    })
  }
)

@react.component
let make = () => {
  open Firebase.Firestore

  let dispatch = Redux.useDispatch()

  let documentsCollection = React.useMemo(() => Firebase.firestore()->collection("documents"))
  let itemsCollection = React.useMemo(() => Firebase.firestore()->collection("items"))

  let (documents, documentsLoading, documentsError) = useCollectionData(
    documentsCollection,
    {"idField": "id"},
  )

  let (items, itemsLoading, itemsError) = useCollectionData(itemsCollection, {"idField": "id"})

  let searchingText = Redux.useSelector(State.SearchPane.searchingText)

  React.useEffect(() => {
    switch (documentsError, itemsError) {
    | (None, None) if !documentsLoading && !itemsLoading =>
      dispatch(Action.SetSearchPaneState({items: searchItems(items, searchingText)}))

    | _ => ()
    }

    None
  })

  React.null
}
