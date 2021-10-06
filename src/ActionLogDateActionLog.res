@react.component
let make = (~dateActionLog: State.dateActionLog, ()) => {
  dateActionLog.date->React.string
}
