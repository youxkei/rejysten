open Belt

@module("react-firebase-hooks/firestore") external useCollectionData: 'any = "useCollectionData"

%%private(
  let makeDocumentsMap = documents => {
    let documentsMap = HashMap.String.make(~hintSize=10)
    let rootDocumentId = ref("")

    documents->Array.forEach(document => {
      let id = document["id"]
      let parentId = document["parerntId"]

      let document = if document["isDirectory"] {
        State.DocumentDirectory({
          id: id,
          text: document["text"],
          parentId: document["parentId"],
          prevId: document["prevId"],
          nextId: document["nextId"],
          firstChildId: document["firstChildId"],
          lastChildId: document["lastChildId"],
        })
      } else {
        State.Document({
          id: id,
          text: document["text"],
          rootItemId: document["rootItemId"],
          parentId: document["parentId"],
          prevId: document["prevId"],
          nextId: document["nextId"],
        })
      }

      documentsMap->HashMap.String.set(id, document)

      if parentId == "" {
        rootDocumentId := id
      }
    })

    (documentsMap, rootDocumentId.contents)
  }
)

@react.component
let make = React.memo(() => {
  open Firebase.Firestore

  let dispatch = Redux.useDispatch()

  let (documents, loading, error) = useCollectionData(
    Firebase.firestore()->collection("documents"),
    {"idField": "id"},
  )

  React.useEffect(() => {
    switch error {
    | None if !loading => {
        let (documentsMap, rootDocumentId) = makeDocumentsMap(documents)

        dispatch(Action.SetDocumentState({map: documentsMap, rootId: rootDocumentId}))
      }
    | _ => ()
    }

    None
  })

  React.null
})

React.setDisplayName(make, "SyncDocumentState")
