@module("react-firebase-hooks/firestore") external useCollectionData: 'any = "useCollectionData"

%%private(
  let toDocuments = documents =>
    Belt.Array.map(documents, (document): State.document => {
      {
        id: document["id"],
        text: document["text"],
        rootItemId: document["rootItemId"],
        parentId: document["parentId"],
        prevId: document["prevId"],
        nextId: document["nextId"],
        firstChildId: document["firstChildId"],
        lastChildId: document["lastChildId"],
      }
    })

  let toItems = items =>
    Belt.Array.map(items, (item): State.item => {
      {
        id: item["id"],
        text: item["text"],
        documentId: item["documentId"],
        nextId: item["nextId"],
        prevId: item["prevId"],
        parentId: item["parentId"],
        firstChildId: item["firstChildId"],
        lastChildId: item["lastChildId"],
      }
    })
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

  React.useEffect(() => {
    switch (documentsError, itemsError) {
    | (None, None) if !documentsLoading && !itemsLoading =>
      dispatch(Action.SetFirestoreState({documents: toDocuments(documents), items: toItems(items)}))

    | _ => ()
    }

    None
  })

  React.null
}
