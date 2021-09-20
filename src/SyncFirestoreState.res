open Belt

@module("react-firebase-hooks/firestore") external useCollectionData: 'any = "useCollectionData"

%%private(
  let toDocumentMap = documents =>
    Belt.Array.reduce(documents, Map.String.empty, (documentMap, document) => {
      let id = document["id"]

      documentMap->Map.String.set(
        id,
        (
          {
            id: id,
            text: document["text"],
            rootItemId: document["rootItemId"],
            parentId: document["parentId"],
            prevId: document["prevId"],
            nextId: document["nextId"],
            firstChildId: document["firstChildId"],
            lastChildId: document["lastChildId"],
          }: State.noteDocument
        ),
      )
    })

  let toItemMap = items =>
    Belt.Array.reduce(items, Map.String.empty, (itemMap, item) => {
      let id = item["id"]

      itemMap->Map.String.set(
        id,
        (
          {
            id: id,
            text: item["text"],
            documentId: item["documentId"],
            nextId: item["nextId"],
            prevId: item["prevId"],
            parentId: item["parentId"],
            firstChildId: item["firstChildId"],
            lastChildId: item["lastChildId"],
          }: State.noteItem
        ),
      )
    })

  let findRootDocumentId = documentMap => {
    documentMap
    ->Map.String.findFirstBy((_, document: State.noteDocument) => {
      document.parentId == ""
    })
    ->Option.map(((rootDocumentId, _)) => rootDocumentId)
    ->Option.getWithDefault("")
  }
)

module Document = {
  @react.component
  let make = () => {
    open Firebase.Firestore

    let dispatch = Redux.useDispatch()

    let documentsCollection = React.useMemo(() => Firebase.firestore()->collection("documents"))

    let (documents, documentsLoading, documentsError) = useCollectionData(
      documentsCollection,
      {"idField": "id"},
    )

    React.useEffect(() => {
      switch documentsError {
      | None if !documentsLoading =>
        let documentMap = documents->toDocumentMap
        let rootDocumentId = documentMap->findRootDocumentId

        dispatch(
          Action.SetFirestoreDocumentState({
            documentMap: documentMap,
            rootDocumentId: rootDocumentId,
          }),
        )

      | _ => ()
      }

      None
    })

    React.null
  }
}

module Item = {
  @react.component
  let make = () => {
    open Firebase.Firestore

    let dispatch = Redux.useDispatch()

    let itemsCollection = React.useMemo(() => Firebase.firestore()->collection("items"))

    let (items, itemsLoading, itemsError) = useCollectionData(itemsCollection, {"idField": "id"})

    React.useEffect(() => {
      switch itemsError {
      | None if !itemsLoading =>
        dispatch(
          Action.SetFirestoreItemState({
            itemMap: items->toItemMap,
          }),
        )

      | _ => ()
      }

      None
    })

    React.null
  }
}

@react.component
let make = () => <> <Document /> <Item /> </>
