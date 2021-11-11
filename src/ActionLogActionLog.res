open Belt

@react.component
let make = (~actionLog: State.actionLog, ()) => {
  let toString = Int.toString
  let {itemMap, rootItemId, text, begin, end} = actionLog

  <BulletList
    bullet={<Bullet />}
    item={`${text} ${begin->toString} ${end->toString}`->React.string}
    child={switch itemMap->Map.String.get(rootItemId) {
    | Some(rootItem) =>
      <Items editable=true isFocused=false item=rootItem selectedItemId="" itemMap />

    | None => React.null
    }}
  />
}
