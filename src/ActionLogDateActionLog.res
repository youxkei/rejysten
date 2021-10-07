open Belt

let rec getActionLogs = (actionLogMap, currentId, actionLogs) => {
  switch actionLogMap->Map.String.get(currentId) {
  | Some(actionLog: State.actionLog) =>
    let _ = actionLogs->Js.Array2.push(actionLog)
    actionLogMap->getActionLogs(actionLog.nextId, actionLogs)

  | None => actionLogs
  }
}

@react.component
let make = (~dateActionLog: State.dateActionLog, ()) => {
  dateActionLog.actionLogMap
  ->getActionLogs(dateActionLog.oldestActionLogId, [])
  ->Array.map(actionLog => <ActionLogActionLog actionLog />)
  ->React.array
}
