open Belt

let recentDateActionLogsNum = 2

let rec getRecentDateActionLogs = (dateActionLogMap, currentId, n, recentDateActionLogs) => {
  if n == recentDateActionLogsNum {
    List.reverse(recentDateActionLogs)
  } else {
    switch dateActionLogMap->Map.String.get(currentId) {
    | Some(dateActionLog: State.dateActionLog) =>
      dateActionLogMap->getRecentDateActionLogs(
        dateActionLog.prevId,
        n + 1,
        list{dateActionLog, ...recentDateActionLogs},
      )

    | None => List.reverse(recentDateActionLogs)
    }
  }
}

@react.component
let make = () => {
  let dateActionLogMap = Redux.useSelector(State.Firestore.dateActionLogMap)
  let latestDateActionLogId = Redux.useSelector(State.Firestore.latestDateActionLogId)

  let recentDateActionLogs =
    dateActionLogMap->getRecentDateActionLogs(latestDateActionLogId, 0, list{})

  recentDateActionLogs
  ->List.map((dateActionLog: State.dateActionLog) => {
    <ActionLogDateActionLog dateActionLog />
  })
  ->List.toArray
  ->React.array
}
