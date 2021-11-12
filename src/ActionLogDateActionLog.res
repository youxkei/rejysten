open Belt

let rec makeActionLogs = (actionLogMap, currentId, actionLogs) => {
  switch actionLogMap->Map.String.get(currentId) {
  | Some(actionLog: State.actionLog) =>
    let _ = actionLogs->Js.Array2.push(actionLog)
    actionLogMap->makeActionLogs(actionLog.nextId, actionLogs)

  | None => actionLogs
  }
}

@react.component
let make = (~dateActionLog: State.dateActionLog, ()) => {
  dateActionLog.actionLogMap
  ->makeActionLogs(dateActionLog.latestActionLogId, [])
  ->Array.map(actionLog => <ActionLogActionLog actionLog />)
  ->React.array
}
