open Belt

@react.component
let make = (~actionLog: State.actionLog, ()) => {
  let {itemMap, rootItemId, text} = actionLog

  <div className=Style.List.container>
    <div className=Style.List.bullet> <Bullet /> </div>
    <div className=Style.List.item> {text->React.string} </div>
    <div className=Style.List.child>
      {switch itemMap->Map.String.get(rootItemId) {
      | Some(rootItem) =>
        <Items editable=true isFocused=false item=rootItem selectedItemId="" itemMap />

      | None => React.null
      }}
    </div>
  </div>
}
