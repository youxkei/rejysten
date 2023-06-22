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
            container: State.Item.Note({documentId: item["documentId"]}),
            nextId: item["nextId"],
            prevId: item["prevId"],
            parentId: item["parentId"],
            firstChildId: item["firstChildId"],
            lastChildId: item["lastChildId"],
          }: State.Item.t
        ),
      )
    })

  let toItemMap = (items, dateActionLogId, actionLogId) =>
    Belt.Array.reduce(items->entries, (Map.String.empty, ""), (
      (itemMap, currentRootItemId),
      (id, item),
    ) => {
      let parentId = item["parentId"]

      (
        itemMap->Map.String.set(
          id,
          (
            {
              id: id,
              container: State.Item.ActionLog({
                dateActionLogId: dateActionLogId,
                actionLogId: actionLogId,
              }),
              text: item["text"],
              parentId: parentId,
              prevId: item["prevId"],
              nextId: item["nextId"],
              firstChildId: item["firstChildId"],
              lastChildId: item["lastChildId"],
            }: State.Item.t
          ),
        ),
        if parentId == "" {
          id
        } else {
          currentRootItemId
        },
      )
    })

  let toActionLogMap = (actionLogs, dateActionLogId) => {
    Belt.Array.reduce(actionLogs->entries, (Map.String.empty, "", ""), (
      (actionLogMap, currentOldedstActionLogId, currentLatestDateActionLogId),
      (id, actionLog),
    ) => {
      let prevId = actionLog["prevId"]
      let nextId = actionLog["nextId"]
      let (itemMap, rootItemId) = actionLog["items"]->toItemMap(dateActionLogId, id)

      (
        actionLogMap->Map.String.set(
          id,
          (
            {
              id: id,
              dateActionLogId: dateActionLogId,
              begin: actionLog["begin"],
              end: actionLog["end"],
              prevId: prevId,
              nextId: nextId,
              text: actionLog["text"],
              itemMap: itemMap,
              rootItemId: rootItemId,
            }: State.actionLog
          ),
        ),
        if prevId == "" {
          id
        } else {
          currentOldedstActionLogId
        },
        if nextId == "" {
          id
        } else {
          currentLatestDateActionLogId
        },
      )
    })
  }

  let toDateActionLogMap = dateActionLogs =>
    Belt.Array.reduce(dateActionLogs, (Map.String.empty, ""), (
      (dateActionLogMap, currentLatestDateActionLogId),
      dateActionLog,
    ) => {
      let id = dateActionLog["id"]
      let nextId = dateActionLog["nextId"]
      let (actionLogMap, oldestActionLogId, latestActionLogId) =
        dateActionLog["actionLogs"]->toActionLogMap(id)

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
              latestActionLogId: latestActionLogId,
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

    let documentsCollection = React.useMemo(() => Firebase.firestore->collection("documents"))

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

    let itemsCollection = React.useMemo(() => Firebase.firestore->collection("items"))

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
  let getOldestRecentDateActionLogId = (dateActionLogMap, latestDateActionLogId) => {
    let rec walk = (dateActionLogId, n) => {
      if n == Config.recentDateActionLogsNum {
        dateActionLogId
      } else {
        switch dateActionLogMap->Map.String.get(dateActionLogId) {
        | Some(dateActionLog: State.dateActionLog) => walk(dateActionLog.prevId, n + 1)

        | None => dateActionLogId
        }
      }
    }

    walk(latestDateActionLogId, 1)
  }

  @react.component
  let make = () => {
    open Firebase.Firestore

    let dispatch = Redux.useDispatch()

    let dateActionLogCollection = React.useMemo(() =>
      Firebase.firestore->collection("dateActionLogs")
    )

    let (dateActionLogs, loading, error) = useCollectionData(
      dateActionLogCollection,
      {"idField": "id"},
    )

    React.useEffect(() => {
      switch error {
      | None if !loading =>
        let (dateActionLogMap, _latestDateActionLogId) = dateActionLogs->toDateActionLogMap
        let latestDateActionLogId = ""
        let oldestRecentDateActionLogId = getOldestRecentDateActionLogId(
          dateActionLogMap,
          latestDateActionLogId,
        )
        dispatch(
          Action.SetFirestoreDateActionLogState({
            dateActionLogMap: dateActionLogMap,
            latestDateActionLogId: latestDateActionLogId,
            oldestRecentDateActionLogId: oldestRecentDateActionLogId,
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
