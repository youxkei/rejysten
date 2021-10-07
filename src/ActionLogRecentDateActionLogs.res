open Belt

let recentDateActionLogsNum = 2

let rec getRecentDateActionLogs = (dateActionLogMap, currentId, n, recentDateActionLogs) => {
  if n == recentDateActionLogsNum {
    recentDateActionLogs
  } else {
    switch dateActionLogMap->Map.String.get(currentId) {
    | Some(dateActionLog: State.dateActionLog) =>
      let _ = recentDateActionLogs->Js.Array2.push(dateActionLog)
      dateActionLogMap->getRecentDateActionLogs(dateActionLog.prevId, n + 1, recentDateActionLogs)

    | None => recentDateActionLogs
    }
  }
}

@react.component
let make = () => {
  let dateActionLogMap = Redux.useSelector(State.Firestore.dateActionLogMap)
  let latestDateActionLogId = Redux.useSelector(State.Firestore.latestDateActionLogId)

  let recentDateActionLogs = dateActionLogMap->getRecentDateActionLogs(latestDateActionLogId, 0, [])

  recentDateActionLogs
  ->Array.map((dateActionLog: State.dateActionLog) => {
    <ActionLogDateActionLog dateActionLog />
  })
  ->React.array
}
