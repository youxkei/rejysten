open Belt

module Record = {
  @react.component
  let make = (~actionLog: State.actionLog, ~isSelectedActionLog, ()) => {
    let mode = Redux.useSelector(State.mode)
    let focus = Redux.useSelector(State.focus)

    let {text, begin, end} = actionLog
    let text = text->React.string
    let beginTime = begin->Date.fromUnixtimeMillis->Date.getTimeStringForDisplay->React.string
    let endTime = end->Date.fromUnixtimeMillis->Date.getTimeStringForDisplay->React.string

    <div className=Style.ActionLog.actionLog>
      {switch mode {
      | State.Insert(_) if isSelectedActionLog => <>
          <p>
            {switch focus {
            | State.ActionLog(State.Record(State.Text())) => <Editor />
            | _ => text
            }}
          </p>
          <p>
            <span>
              {switch focus {
              | State.ActionLog(State.Record(Begin())) => <Editor inline=true />

              | _ => beginTime
              }}
            </span>
            <span> {` → `->React.string} </span>
            <span>
              {switch focus {
              | State.ActionLog(State.Record(End())) => <Editor inline=true />

              | _ => endTime
              }}
            </span>
          </p>
        </>

      | _ => <>
          <p> {text} </p>
          <p>
            <span> {beginTime} </span>
            <span> {` → `->React.string} </span>
            <span> {endTime} </span>
          </p>
        </>
      }}
    </div>
  }
}

@react.component
let make = (~actionLog: State.actionLog, ~focus, ()) => {
  let selectedId = Redux.useSelector(State.ActionLog.selectedActionLogId)
  let selectedActionLogItemId = Redux.useSelector(State.ActionLog.selectedActionLogItemId)

  let {id, itemMap, rootItemId} = actionLog
  let (isSelectedActionLog, focusable) = switch focus {
  | State.Record(_) => (id == selectedId, false)
  | State.Items() => (false, true)
  }

  <BulletList
    bullet={<Bullet />}
    item={<Record actionLog isSelectedActionLog />}
    isSelectedItem=isSelectedActionLog
    child={switch itemMap->Map.String.get(rootItemId) {
    | Some(rootItem) =>
      <Items editable=true focusable item=rootItem selectedItemId=selectedActionLogItemId itemMap />

    | None => React.null
    }}
  />
}
