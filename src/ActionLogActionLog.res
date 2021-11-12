open Belt

@react.component
let make = (~actionLog: State.actionLog, ()) => {
  let currentId = Redux.useSelector(State.ActionLog.selectedId)
  let toString = Int.toString
  let {id, itemMap, rootItemId, text, begin, end} = actionLog
  let isCurrentActionLog = id === currentId

  <BulletList
    bullet={<Bullet />}
    item={`${text} ${begin->toString} ${end->toString}`->React.string}
    isSelectedItem=isCurrentActionLog
    child={switch itemMap->Map.String.get(rootItemId) {
    | Some(rootItem) =>
      <Items editable=true isFocused=false item=rootItem selectedItemId="" itemMap />

    | None => React.null
    }}
  />
}
