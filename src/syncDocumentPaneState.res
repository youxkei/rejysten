open Belt

@module("react-firebase-hooks/firestore") external useCollectionData: 'any = "useCollectionData"

%%private(
  let makeDocumentMap = documents => {
    let documentMap = HashMap.String.make(~hintSize=10)
    let rootDocumentId = ref("")

    documents->Array.forEach(document => {
      let document: State.document = {
        id: document["id"],
        text: document["text"],
        rootItemId: document["rootItemId"],
        parentId: document["parentId"],
        prevId: document["prevId"],
        nextId: document["nextId"],
        firstChildId: document["firstChildId"],
        lastChildId: document["lastChildId"],
      }

      documentMap->HashMap.String.set(document.id, document)

      if document.parentId == "" {
        rootDocumentId := document.id
      }
    })

    (documentMap, rootDocumentId.contents)
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
        let (documentMap, rootDocumentId) = makeDocumentMap(documents)

        dispatch(Action.SetDocumentPaneState({map: documentMap, rootId: rootDocumentId}))
      }
    | _ => ()
    }

    None
  })

  React.null
})

React.setDisplayName(make, "SyncDocumentState")
