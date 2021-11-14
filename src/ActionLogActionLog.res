open Belt

let getTimeString = unixtime => {
  if unixtime == 0 {
    "unspecified"
  } else {
    let date = Js.Date.fromFloat(unixtime->Int.toFloat)
    `${date->Js.Date.getHours->Float.toString}:${date->Js.Date.getMinutes->Float.toString}:${date
      ->Js.Date.getSeconds
      ->Float.toString}`
  }
}

module ActionLog = {
  @react.component
  let make = (~actionLog: State.actionLog, ()) => {
    let {text, begin, end} = actionLog
    let begin = begin->getTimeString
    let end = end->getTimeString

    <> <p> {text->React.string} </p> <p> {`${begin} → ${end}`->React.string} </p> </>
  }
}

@react.component
let make = (~actionLog: State.actionLog, ()) => {
  let selectedId = Redux.useSelector(State.ActionLog.selectedActionLogId)
  let {id, itemMap, rootItemId} = actionLog
  let isSelectedActionLog = id === selectedId

  <BulletList
    bullet={<Bullet />}
    item={<ActionLog actionLog />}
    isSelectedItem=isSelectedActionLog
    child={switch itemMap->Map.String.get(rootItemId) {
    | Some(rootItem) =>
      <Items editable=true isFocused=false item=rootItem selectedItemId="" itemMap />

    | None => React.null
    }}
  />
}
