open Belt

@module("react-firebase-hooks/firestore") external useCollectionData: 'any = "useCollectionData"

%%private(
  let makeDocumentsMap = documents => {
    let documentsMap = HashMap.String.make(~hintSize=10)

    documents->Array.forEach(document => {
      let id = document["id"]

      let document = State.Document({
        id: id,
        rootItemId: document["rootItemId"],
      })

      documentsMap->HashMap.String.set(id, document)
    })

    documentsMap
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
        dispatch(Action.SetDocumentsMap(makeDocumentsMap(documents)))
      }
    | _ => ()
    }

    None
  })

  React.null
}
