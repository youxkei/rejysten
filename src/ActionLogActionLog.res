open Belt

let getTimeString = unixtimeMillis => {
  if unixtimeMillis == 0.0 {
    "N/A"
  } else {
    unixtimeMillis->Date.fromUnixtimeMillis->Date.formatTime
  }
}

module ActionLog = {
  @react.component
  let make = (~actionLog: State.actionLog, ~isSelectedActionLog, ()) => {
    let mode = Redux.useSelector(State.mode)
    let {text, begin, end} = actionLog
    let begin = begin->getTimeString
    let end = end->getTimeString

    <>
      <p>
        {switch mode {
        | State.Insert(_) if isSelectedActionLog => <Editor />

        | _ => text->React.string
        }}
      </p>
      <p> {`${begin} → ${end}`->React.string} </p>
    </>
  }
}

@react.component
let make = (~actionLog: State.actionLog, ()) => {
  let selectedId = Redux.useSelector(State.ActionLog.selectedActionLogId)
  let {id, itemMap, rootItemId} = actionLog
  let isSelectedActionLog = id === selectedId

  <BulletList
    bullet={<Bullet />}
    item={<ActionLog actionLog isSelectedActionLog />}
    isSelectedItem=isSelectedActionLog
    child={switch itemMap->Map.String.get(rootItemId) {
    | Some(rootItem) =>
      <Items editable=true isFocused=false item=rootItem selectedItemId="" itemMap />

    | None => React.null
    }}
  />
}
