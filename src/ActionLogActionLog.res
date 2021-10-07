open Belt

@react.component
let make = (~actionLog: State.actionLog, ()) => {
  let {itemMap, rootItemId, text} = actionLog

  switch itemMap->Map.String.get(rootItemId) {
  | Some(rootItem) => <>
      {text->React.string}
      <Items editable=true isFocused=false item=rootItem selectedItemId="" itemMap />
    </>

  | None => text->React.string
  }
}
