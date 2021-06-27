@module("react-firebase-hooks/firestore") external useCollectionData: 'any = "useCollectionData"

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

  React.null
}
