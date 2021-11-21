open Belt

module ActionLog = {
  @react.component
  let make = (~actionLog: State.actionLog, ~isSelectedActionLog, ()) => {
    let mode = Redux.useSelector(State.mode)
    let focus = Redux.useSelector(State.ActionLog.focus)

    let {text, begin, end} = actionLog
    let text = text->React.string
    let beginTime = begin->Date.fromUnixtimeMillis->Date.getTimeStringForDisplay->React.string
    let endTime = end->Date.fromUnixtimeMillis->Date.getTimeStringForDisplay->React.string

    <div className=Style.ActionLog.actionLog>
      {switch mode {
      | State.Insert(_) if isSelectedActionLog => <>
          <p>
            {switch focus {
            | State.ActionLog() => <Editor />
            | _ => text
            }}
          </p>
          <p>
            <span>
              {switch focus {
              | State.Begin() => <Editor inline=true />

              | _ => beginTime
              }}
            </span>
            <span> {` → `->React.string} </span>
            <span>
              {switch focus {
              | State.End() => <Editor inline=true />

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
