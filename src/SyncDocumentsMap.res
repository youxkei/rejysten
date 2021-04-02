open Belt

@module("react-firebase-hooks/firestore") external useCollectionData: 'any = "useCollectionData"

%%private(
  let makeDocumentsMap = documents => {
    let documentsMap = HashMap.String.make(~hintSize=10)
    let rootDocumentId = ref("")

    documents->Array.forEach(document => {
      let id = document["id"]

      let document: State.document = {
        id: id,
        text: document["text"],
        rootItemId: document["rootItemId"],
        parentId: document["parentId"],
        prevId: document["prevId"],
        nextId: document["nextId"],
        firstChildId: document["firstChildId"],
        lastChildId: document["lastChildId"],
      }

      documentsMap->HashMap.String.set(id, document)

      if document.parentId == "" {
        rootDocumentId := document.id
      }
    })

    (documentsMap, rootDocumentId.contents)
  }
)

@react.component
let make = () => {
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

        dispatch(Action.SetDocumentsMap({map: documentsMap, rootId: rootDocumentId}))
      }
    | _ => ()
    }

    None
  })

  React.null
}
