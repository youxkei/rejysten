open Belt

@react.component
let make = (~actionLog: State.actionLog, ()) => {
  let selectedId = Redux.useSelector(State.ActionLog.selectedId)
  let toString = Int.toString
  let {id, itemMap, rootItemId, text, begin, end} = actionLog
  let isSelectedActionLog = id === selectedId

  <BulletList
    bullet={<Bullet />}
    item={`${text} ${begin->toString} ${end->toString}`->React.string}
    isSelectedItem=isSelectedActionLog
    child={switch itemMap->Map.String.get(rootItemId) {
    | Some(rootItem) =>
      <Items editable=true isFocused=false item=rootItem selectedItemId="" itemMap />

    | None => React.null
    }}
  />
}
