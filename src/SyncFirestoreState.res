open Belt

@module("react-firebase-hooks/firestore") external useCollectionData: 'any = "useCollectionData"

@val @scope("Object")
external entries: 'a => array<(string, 'b)> = "entries"

%%private(
  let toNoteDocumentMap = documents =>
    Belt.Array.reduce(documents, (Map.String.empty, ""), (
      (documentMap, currentRootDocumentId),
      document,
    ) => {
      let id = document["id"]
      let parentId = document["parentId"]

      (
        documentMap->Map.String.set(
          id,
          (
            {
              id: id,
              text: document["text"],
              rootItemId: document["rootItemId"],
              parentId: parentId,
              prevId: document["prevId"],
              nextId: document["nextId"],
              firstChildId: document["firstChildId"],
              lastChildId: document["lastChildId"],
            }: State.noteDocument
          ),
        ),
        if parentId == "" {
          id
        } else {
          currentRootDocumentId
        },
      )
    })

  let toNoteItemMap = items =>
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

  let toActionLogItem = (actionLogItems, dateActionLogId, actionLogId) =>
    Belt.Array.reduce(actionLogItems->entries, (Map.String.empty, ""), (
      (actionLogItemMap, currentRootActionLogItemId),
      (id, actionLogItem),
    ) => {
      let parentId = actionLogItem["parentId"]

      (
        actionLogItemMap->Map.String.set(
          id,
          (
            {
              id: id,
              dateActionLogId: dateActionLogId,
              actionLogId: actionLogId,
              text: actionLogItem["text"],
              parentId: parentId,
              prevId: actionLogItem["prevId"],
              nextId: actionLogItem["nextId"],
              firstChildId: actionLogItem["firstChildId"],
              lastChildId: actionLogItem["lastChildId"],
            }: State.actionLogItem
          ),
        ),
        if parentId == "" {
          id
        } else {
          currentRootActionLogItemId
        },
      )
    })

  let toActionLogMap = (actionLogs, dateActionLogId) => {
    let (actionLogMap, (oldestActionLogId, _)) = Belt.Array.reduce(
      actionLogs->entries,
      (Map.String.empty, ("", -1)),
      (
        (actionLogMap, (currentOldedstActionLogId, currentOldestsActionLogBegin)),
        (id, actionLog),
      ) => {
        let begin = actionLog["begin"]
        let (itemMap, rootItemId) = actionLog["items"]->toActionLogItem(dateActionLogId, id)

        (
          actionLogMap->Map.String.set(
            id,
            (
              {
                id: id,
                dateActionLogId: dateActionLogId,
                begin: begin,
                end: actionLog["end"],
                prevId: actionLog["prevId"],
                nextId: actionLog["nextId"],
                text: actionLog["text"],
                itemMap: itemMap,
                rootItemId: rootItemId,
              }: State.actionLog
            ),
          ),
          if currentOldestsActionLogBegin == -1 || begin < currentOldestsActionLogBegin {
            (id, begin)
          } else {
            (currentOldedstActionLogId, currentOldestsActionLogBegin)
          },
        )
      },
    )

    (actionLogMap, oldestActionLogId)
  }

  let toDateActionLogMap = dateActionLogs =>
    Belt.Array.reduce(dateActionLogs, (Map.String.empty, ""), (
      (dateActionLogMap, currentLatestDateActionLogId),
      dateActionLog,
    ) => {
      let id = dateActionLog["id"]
      let nextId = dateActionLog["nextId"]
      let (actionLogMap, oldestActionLogId) = dateActionLog["actionLogs"]->toActionLogMap(id)

      (
        dateActionLogMap->Map.String.set(
          id,
          (
            {
              id: id,
              date: dateActionLog["date"],
              prevId: dateActionLog["prevId"],
              nextId: nextId,
              actionLogMap: actionLogMap,
              oldestActionLogId: oldestActionLogId,
            }: State.dateActionLog
          ),
        ),
        if nextId == "" {
          id
        } else {
          currentLatestDateActionLogId
        },
      )
    })
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
        let (documentMap, rootDocumentId) = documents->toNoteDocumentMap

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
            itemMap: items->toNoteItemMap,
          }),
        )

      | _ => ()
      }

      None
    })

    React.null
  }
}

module DateActionLog = {
  @react.component
  let make = () => {
    open Firebase.Firestore

    let dispatch = Redux.useDispatch()

    let dateActionLogCollection = React.useMemo(() =>
      Firebase.firestore()->collection("dateActionLogs")
    )

    let (dateActionLogs, loading, error) = useCollectionData(
      dateActionLogCollection,
      {"idField": "id"},
    )

    React.useEffect(() => {
      switch error {
      | None if !loading =>
        let (dateActionLogMap, latestDateActionLogId) = dateActionLogs->toDateActionLogMap
        dispatch(
          Action.SetFirestoreDateActionLogState({
            dateActionLogMap: dateActionLogMap,
            latestDateActionLogId: latestDateActionLogId,
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
let make = () => <> <Document /> <Item /> <DateActionLog /> </>
