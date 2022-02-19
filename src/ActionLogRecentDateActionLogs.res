open Belt

let rec makeRecentDateActionLogs = (
  dateActionLogMap,
  oldestRecentDateActionLogId,
  currentId,
  n,
  recentDateActionLogs,
) => {
  switch dateActionLogMap->Map.String.get(currentId) {
  | Some(dateActionLog: State.dateActionLog) =>
    let _ = recentDateActionLogs->Js.Array2.unshift(dateActionLog)

    if dateActionLog.id == oldestRecentDateActionLogId {
      recentDateActionLogs
    } else {
      dateActionLogMap->makeRecentDateActionLogs(
        oldestRecentDateActionLogId,
        dateActionLog.prevId,
        n + 1,
        recentDateActionLogs,
      )
    }

  | None => recentDateActionLogs
  }
}

@react.component
let make = (~focus) => {
  let dateActionLogMap = Redux.useSelector(Selector.Firestore.dateActionLogMap)
  let latestDateActionLogId = Redux.useSelector(Selector.Firestore.latestDateActionLogId)
  let oldestRecentDateActionLogId = Redux.useSelector(
    Selector.Firestore.oldestRecentDateActionLogId,
  )

  let recentDateActionLogs =
    dateActionLogMap->makeRecentDateActionLogs(
      oldestRecentDateActionLogId,
      latestDateActionLogId,
      0,
      [],
    )

  recentDateActionLogs
  ->Array.map((dateActionLog: State.dateActionLog) => {
    <ActionLogDateActionLog key=dateActionLog.id dateActionLog focus />
  })
  ->React.array
}
